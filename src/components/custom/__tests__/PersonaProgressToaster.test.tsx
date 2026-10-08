import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { PersonaProgressToaster } from '../PersonaProgressToaster'
import { usePersonaStore } from '@/ui/stores/personaStore'

// Regression test for the duplicate-toast race: poll() is async and runs on a
// 1s interval with no in-flight guard, so two overlapping executions can both
// read the (then-empty) toast-id map and each create a fresh toast for the
// same run. Sonner dedupes by id, so every toast call for a run must share
// one id — a deterministic id derived from the runId.

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

// Each action call gets its own controlled promise, in call order.
const resultDeferreds: Array<ReturnType<typeof deferred<any>>> = []
const progressDeferreds: Array<ReturnType<typeof deferred<any>>> = []

vi.mock('@/actions/getPersonaGenerationResult', () => ({
  getPersonaGenerationResultAction: vi.fn(() => {
    const d = deferred<any>()
    resultDeferreds.push(d)
    return d.promise
  }),
}))

vi.mock('@/actions/getProgress', () => ({
  getProgressAction: vi.fn(() => {
    const d = deferred<any>()
    progressDeferreds.push(d)
    return d.promise
  }),
}))

// Batch naming goes through a server action; the toaster must fall back to its
// count label when the model returns nothing, so the default is null.
const batchTitle = vi.fn(async (_personas: unknown, _context: unknown) => ({
  title: null as string | null,
}))

vi.mock('@/actions/generateBatchTitleAction', () => ({
  generateBatchTitleAction: (personas: unknown, context: unknown) => batchTitle(personas, context),
}))

const toastCustom = vi.fn()

vi.mock('sonner', () => ({
  toast: { custom: (...args: unknown[]) => toastCustom(...args) },
}))

function toastIds(): Array<string | number | undefined> {
  // toast.custom(node, options) — the id lives in the options object
  return toastCustom.mock.calls.map((c) => (c[1] as { id?: string | number })?.id)
}

function distinctIds(ids: Array<string | number | undefined>): Set<string | number | undefined> {
  return new Set(ids.filter((id) => id !== undefined))
}

beforeEach(() => {
  resultDeferreds.length = 0
  progressDeferreds.length = 0
  toastCustom.mockClear()
  batchTitle.mockClear()
  batchTitle.mockResolvedValue({ title: null })
  // Module-level toaster state (toastIdMap/removedSet/completedSet) persists
  // across tests; unique runIds keep each test isolated.
})

afterEach(() => {
  cleanup()
  usePersonaStore.getState().removeActiveGeneration('race-run')
  // The failure tests now store a batch; drop anything the toaster added so
  // the store does not leak into the next test.
  for (const batch of usePersonaStore.getState().batches) {
    usePersonaStore.getState().removeBatch(batch.id)
  }
})

describe('PersonaProgressToaster', () => {
  it('creates exactly one toast per run even when polls overlap (the duplicate-toast race)', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      // Start a run → the toaster effect fires poll #1, which suspends on the
      // (unresolved) result action.
      act(() => {
        usePersonaStore.getState().addActiveGeneration('race-run')
      })

      // Let the 1s interval fire so poll #2 starts while poll #1 is still
      // awaiting — both read the toast-id state before either writes it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // Both polls see "not found yet", then both get progress → both reach
      // toast creation.
      await act(async () => {
        resultDeferreds[0]?.resolve({ found: false })
        resultDeferreds[1]?.resolve({ found: false })
        await Promise.resolve()
      })
      await act(async () => {
        progressDeferreds[0]?.resolve({ found: true, progress: { step: 'BRAINSTORMING_PERSONAS' } })
        progressDeferreds[1]?.resolve({ found: true, progress: { step: 'BRAINSTORMING_PERSONAS' } })
        await Promise.resolve()
      })

      const ids = toastIds()
      expect(ids.length).toBeGreaterThanOrEqual(2) // two overlapping polls both fired
      // All creations for the same run must target one toast id.
      expect(distinctIds(ids).size).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flips the toast to the error state when progress reports the failure', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      act(() => {
        usePersonaStore.getState().addActiveGeneration('err-run')
      })

      // Poll #1: the result store has no entry yet (stale-poll race, or the
      // 30-min cleanup), but the progress store carries the failure forever.
      // The toast must still settle in the error state — not stay
      // "Generating personas" at step DONE.
      await act(async () => {
        resultDeferreds[0]?.resolve({ found: false })
        await Promise.resolve()
      })
      await act(async () => {
        progressDeferreds[0]?.resolve({
          found: true,
          progress: { step: 'DONE', hasCompleted: true, error: 'A'.repeat(500) },
        })
        await Promise.resolve()
      })

      const call = toastCustom.mock.calls.at(-1)!
      const element = (call[0] as () => React.ReactNode)()
      expect(element).toMatchObject({
        props: expect.objectContaining({
          title: 'Generation Failed',
          variant: 'error',
          progress: 1,
        }),
      })
      // The multi-KB error string is truncated in the toast, not dumped raw.
      const subtext = (element as { props: { subtext?: string } }).props.subtext
      expect(subtext).toBeTruthy()
      expect(subtext!.length).toBeLessThan(300)

      // The run is settled: the store no longer tracks it as active.
      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('err-run')

      // The failure leaves a record. It used to leave nothing at all, so the
      // batch vanished from the list and the user could not tell a run had
      // died, let alone why.
      const batch = usePersonaStore.getState().batches.find((b) => b.error?.startsWith('AAAA'))
      expect(batch).toBeTruthy()
      expect(batch?.personas).toEqual([])
      expect(batch?.source).toBe('interviews')
    } finally {
      vi.useRealTimers()
    }
  })

  it('records a batch when the result store itself reports the failure', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      act(() => {
        usePersonaStore.getState().addActiveGeneration('fail-run')
      })

      await act(async () => {
        resultDeferreds[0]?.resolve({
          found: true,
          error: 'Persona generation blew up',
          personas: [],
        })
        await Promise.resolve()
      })

      const batch = usePersonaStore
        .getState()
        .batches.find((b) => b.error === 'Persona generation blew up')
      expect(batch).toBeTruthy()
      expect(batch?.personas).toEqual([])
      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('fail-run')
    } finally {
      vi.useRealTimers()
    }
  })

  it('names a settled batch through the model instead of a bare count', async () => {
    batchTitle.mockResolvedValueOnce({ title: 'Nordic public-sector buyers' })
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      act(() => {
        usePersonaStore.getState().addActiveGeneration('named-run')
      })

      await act(async () => {
        resultDeferreds[0]?.resolve({ found: true, personas: [{ id: 'p1', name: 'Ada' }] })
        await Promise.resolve()
      })

      const batch = usePersonaStore.getState().batches.at(-1)
      expect(batch?.label).toBe('Nordic public-sector buyers')
      expect(batch?.personas).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the count label when the model returns no title', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      act(() => {
        usePersonaStore.getState().addActiveGeneration('unnamed-run')
      })

      await act(async () => {
        resultDeferreds[0]?.resolve({ found: true, personas: [{ id: 'p1', name: 'Ada' }] })
        await Promise.resolve()
      })

      // 'unnamed-run' carries no `pt-` prefix, so it reads as an interview run.
      expect(usePersonaStore.getState().batches.at(-1)?.label).toBe(
        '1 Personas from Interviews',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
