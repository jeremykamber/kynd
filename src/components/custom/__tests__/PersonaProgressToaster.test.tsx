import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import type { ExternalToast } from 'sonner'
import type { ProgressState } from '@/actions/getProgress'
import {
  PersonaProgressToaster,
  type PersonaToastContentProps,
} from '../PersonaProgressToaster'
import { usePersonaStore } from '@/ui/stores/personaStore'
import {
  forgetPersonaRun,
  PERSONA_RUN_POLL_INTERVAL_MS,
  PERSONA_RUN_STALL_MS,
  PERSONA_RUN_STALLED_MESSAGE,
} from '@/lib/personaRunPolling'
import { forgetInterviewRunInput, rememberInterviewRun } from '@/lib/personaRunSubmission'

// The toaster used to run a 1s interval whose async poll was not awaited, so a
// slow round trip overlapped itself and stacked up to two server-action POSTs
// per second per run. These tests pin the replacement: one round trip at a
// time, one cadence, one toast per run.

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

/** What the mocked result action resolves with; personas are only counted. */
interface ResultPayload {
  found: boolean
  personas?: unknown[]
  error?: string
  cancelled?: boolean
}

interface ProgressPayload {
  found: boolean
  progress?: ProgressState
}

// Each action call gets its own controlled promise, in call order.
const resultDeferreds: Array<Deferred<ResultPayload>> = []
const progressDeferreds: Array<Deferred<ProgressPayload>> = []

vi.mock('@/actions/getPersonaGenerationResult', () => ({
  getPersonaGenerationResultAction: () => {
    const call = deferred<ResultPayload>()
    resultDeferreds.push(call)
    return call.promise
  },
}))

vi.mock('@/actions/getProgress', () => ({
  getProgressAction: () => {
    const call = deferred<ProgressPayload>()
    progressDeferreds.push(call)
    return call.promise
  },
}))

const cancelRequest = vi.fn(async (_runId: string) => ({
  success: true,
  message: 'cancelled',
}))
vi.mock('@/actions/cancelRequest', () => ({
  cancelRequestAction: (runId: string) => cancelRequest(runId),
}))

const startGeneration = vi.fn(async (_formData: FormData) => ({ runId: 'retry-run' }))
vi.mock('@/actions/generatePersonasFromInterviews', () => ({
  generatePersonasFromInterviewsAction: (formData: FormData) => startGeneration(formData),
}))

// Batch naming goes through a server action; the toaster must fall back to its
// own count label when the model returns nothing.
const batchTitle = vi.fn(async (_personas: unknown, _context: unknown) => ({
  title: null as string | null,
}))
vi.mock('@/actions/generateBatchTitleAction', () => ({
  generateBatchTitleAction: (personas: unknown, context: unknown) => batchTitle(personas, context),
}))

interface CapturedToast {
  jsx: () => React.ReactElement<PersonaToastContentProps>
  options?: ExternalToast
}

const customCalls: CapturedToast[] = []
const dismissCalls: string[] = []

vi.mock('sonner', () => ({
  toast: {
    custom: (jsx: () => React.ReactElement<PersonaToastContentProps>, options?: ExternalToast) => {
      customCalls.push({ jsx, options })
      return 'toast-id'
    },
    dismiss: (id: string) => {
      dismissCalls.push(id)
      return id
    },
  },
}))

function toastProps(index: number): PersonaToastContentProps {
  return customCalls[index].jsx().props
}

function lastToast(): { props: PersonaToastContentProps; options?: ExternalToast } {
  const call = customCalls.at(-1)!
  return { props: call.jsx().props, options: call.options }
}

function distinctToastIds(): Set<string> {
  return new Set(customCalls.map((call) => String(call.options?.id)))
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Answers the pending result poll with "not finished yet". */
async function answerResultPending() {
  await act(async () => {
    resultDeferreds.at(-1)?.resolve({ found: false })
    await Promise.resolve()
  })
}

/** Answers the pending progress poll with what the run last reported. */
async function answerProgress(progress: ProgressState) {
  await act(async () => {
    progressDeferreds.at(-1)?.resolve({ found: true, progress })
    await Promise.resolve()
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  resultDeferreds.length = 0
  progressDeferreds.length = 0
  customCalls.length = 0
  dismissCalls.length = 0
  cancelRequest.mockClear()
  startGeneration.mockClear()
  batchTitle.mockClear()
  batchTitle.mockResolvedValue({ title: null })
})

afterEach(() => {
  cleanup()
  for (const runId of usePersonaStore.getState().activeGenerationRunIds) {
    usePersonaStore.getState().removeActiveGeneration(runId)
    forgetPersonaRun(runId)
    forgetInterviewRunInput(runId)
  }
  for (const batch of usePersonaStore.getState().batches) {
    usePersonaStore.getState().removeBatch(batch.id)
  }
})

describe('PersonaProgressToaster', () => {
  it('never lets a slow round trip stack: one poll at a time, one per cadence', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)

      act(() => {
        usePersonaStore.getState().addActiveGeneration('slow-run')
      })

      // The first poll is still in flight; three cadences pass.
      await advance(PERSONA_RUN_POLL_INTERVAL_MS * 3)
      expect(resultDeferreds).toHaveLength(1)

      // It resolves, so the run is reported once; later cadences poll again.
      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 1, totalCount: 4 })
      await advance(PERSONA_RUN_POLL_INTERVAL_MS * 2)
      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 2, totalCount: 4 })

      // Two observations inside a cadence share one round trip, and the whole
      // run costs about one pair per cadence — not the old two POSTs/second.
      expect(resultDeferreds.length).toBeLessThanOrEqual(2)
      expect(progressDeferreds.length).toBeLessThanOrEqual(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders exactly one toast per run, on one id', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('race-run')
      })

      await answerResultPending()
      await answerProgress({ step: 'BRAINSTORMING_PERSONAS' })
      await advance(PERSONA_RUN_POLL_INTERVAL_MS)
      await answerResultPending()
      await answerProgress({ step: 'BRAINSTORMING_PERSONAS' })

      expect(customCalls.length).toBeGreaterThanOrEqual(2)
      expect(distinctToastIds().size).toBe(1)
      expect(distinctToastIds().has('persona-toast-race-run')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the run percentage, an elapsed clock and a cancel action while it works', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('progress-run')
      })

      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 2, totalCount: 4 })
      await advance(30_000)
      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 3, totalCount: 4 })

      const { props, options } = lastToast()

      expect(props.title).toBe('Generating personas')
      expect(props.subtext).toBe('Generating personas')
      // GENERATING owns the 0.5–0.92 band of the bar; 3 of 4 fills 75% of it.
      expect(props.progress).toBeCloseTo(0.815, 3)
      // Caption role: percentage first, then the elapsed clock.
      expect(props.meta).toMatch(/^\d+% · \d+:\d\d elapsed/)
      expect(typeof props.onCancel).toBe('function')
      expect(options?.duration).toBe(Infinity)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never surfaces a transient retry as the run subtitle', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('retry-chatter-run')
      })

      await answerResultPending()
      await answerProgress({
        step: 'GENERATING',
        streamingText: "We ran into an issue generating the personas, so we're retrying.",
      })

      expect(lastToast().props.subtext).toBe('Generating personas')
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles a run that stopped reporting as stalled, exactly once', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('hung-run')
      })

      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 1, totalCount: 3 })
      const reportsBeforeStall = customCalls.length

      // Nothing new for longer than the stall window.
      await advance(PERSONA_RUN_STALL_MS + PERSONA_RUN_POLL_INTERVAL_MS)
      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 1, totalCount: 3 })

      const { props, options } = lastToast()
      expect(props.title).toBe('Generation Stalled')
      expect(props.subtext).toBe(PERSONA_RUN_STALLED_MESSAGE)
      expect(props.variant).toBe('error')
      expect(options?.duration).toBe(8000)

      // The run leaves the tracker, so the polling stops here.
      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('hung-run')

      const batch = usePersonaStore
        .getState()
        .batches.find((entry) => entry.error === PERSONA_RUN_STALLED_MESSAGE)
      expect(batch).toBeTruthy()
      expect(batch?.personas).toEqual([])
      expect(batch?.source).toBe('interviews')

      // Further polls must not re-settle it or produce another toast.
      await advance(PERSONA_RUN_POLL_INTERVAL_MS * 3)
      expect(customCalls.length).toBe(reportsBeforeStall + 1)
      expect(distinctToastIds().size).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('offers Retry on a stalled run in the same tab, and refuses when the inputs are gone', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      rememberInterviewRun('stalled-with-inputs', {
        transcripts: [{ name: 'a.txt', content: 'hello' }],
        personaCount: 2,
        mode: 'individual',
      })
      act(() => {
        usePersonaStore.getState().addActiveGeneration('stalled-with-inputs')
      })

      await answerResultPending()
      await answerProgress({ step: 'EXTRACTING' })
      await advance(PERSONA_RUN_STALL_MS + PERSONA_RUN_POLL_INTERVAL_MS)
      await answerResultPending()
      await answerProgress({ step: 'EXTRACTING' })

      const retryable = lastToast().props
      expect(typeof retryable.onRetry).toBe('function')

      await act(async () => {
        retryable.onRetry?.()
        await Promise.resolve()
        await Promise.resolve()
      })

      // The retry is a new run with a new toast; the failed one is dismissed.
      expect(startGeneration).toHaveBeenCalledTimes(1)
      expect(usePersonaStore.getState().activeGenerationRunIds).toContain('retry-run')
      expect(dismissCalls).toContain('persona-toast-stalled-with-inputs')

      // A run this tab did not start cannot be retried.
      act(() => {
        usePersonaStore.getState().addActiveGeneration('stalled-without-inputs')
      })
      await answerResultPending()
      await answerProgress({ step: 'EXTRACTING' })
      await advance(PERSONA_RUN_STALL_MS + PERSONA_RUN_POLL_INTERVAL_MS)
      await answerResultPending()
      await answerProgress({ step: 'EXTRACTING' })

      expect(lastToast().props.onRetry).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels an in-progress run on the server and stops watching it', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('cancel-run')
      })

      await answerResultPending()
      await answerProgress({ step: 'GENERATING', completedCount: 1, totalCount: 5 })

      const onCancel = lastToast().props.onCancel
      expect(typeof onCancel).toBe('function')

      await act(async () => {
        onCancel?.()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(cancelRequest).toHaveBeenCalledWith('cancel-run')
      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('cancel-run')
      expect(dismissCalls).toContain('persona-toast-cancel-run')

      // A run the user stopped is not a failure: no batch row is recorded.
      expect(usePersonaStore.getState().batches).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles a cancelled run without recording a failure', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('cancelled-run')
      })

      // The server stored the cancellation while another tab was watching, or
      // the tab that cancelled has already gone: both settle the same way.
      await act(async () => {
        resultDeferreds.at(-1)?.resolve({ found: true, personas: [], cancelled: true })
        await Promise.resolve()
      })
      await flush()

      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('cancelled-run')
      expect(usePersonaStore.getState().batches.find((b) => b.runId === 'cancelled-run')).toBeUndefined()
      expect(lastToast().props.title).toBe('Generation Cancelled')
      expect(lastToast().props.variant).toBe('cancelled')
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

      await answerResultPending()
      await answerProgress({ step: 'DONE', hasCompleted: true, error: 'A'.repeat(500) })
      await flush()

      const { props } = lastToast()
      expect(props.title).toBe('Generation Failed')
      expect(props.variant).toBe('error')
      expect(props.progress).toBe(1)

      // The multi-KB error string is truncated in the toast, not dumped raw.
      expect(props.subtext).toBeTruthy()
      expect(props.subtext!.length).toBeLessThan(300)

      expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('err-run')

      const batch = usePersonaStore.getState().batches.find((b) => b.error?.startsWith('AAAA'))
      expect(batch).toBeTruthy()
      expect(batch?.personas).toEqual([])
      expect(batch?.source).toBe('interviews')
    } finally {
      vi.useRealTimers()
    }
  })

  it('says "1 Persona", not "1 Personas", when a single persona lands', async () => {
    vi.useFakeTimers()
    try {
      render(<PersonaProgressToaster />)
      act(() => {
        usePersonaStore.getState().addActiveGeneration('single-run')
      })

      await act(async () => {
        resultDeferreds[0]?.resolve({ found: true, personas: [{ id: 'p1', name: 'Ada' }] })
        await Promise.resolve()
      })
      await flush()

      expect(lastToast().props.title).toBe('1 Persona Ready')
      // 'single-run' carries no `pt-` prefix, so it reads as an interview run.
      expect(usePersonaStore.getState().batches.at(-1)?.label).toBe('1 Persona from Interviews')
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
      await flush()

      const batch = usePersonaStore.getState().batches.at(-1)
      expect(batch?.label).toBe('Nordic public-sector buyers')
      expect(batch?.personas).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
