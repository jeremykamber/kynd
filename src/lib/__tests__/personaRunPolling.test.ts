import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProgressState } from '@/actions/getProgress'
import {
  forgetPersonaRun,
  observePersonaRun,
  PERSONA_RUN_POLL_INTERVAL_MS,
  PERSONA_RUN_STALL_MS,
  runStartedAt,
  runStatusText,
  startPersonaRunPolling,
} from '../personaRunPolling'

// The storm the audit measured (132 POSTs in 49s for one run) came from three
// surfaces each polling on their own timer. What this module has to guarantee
// is that the number of round trips is a function of the cadence, not of how
// many components happen to be mounted.

interface MockResult {
  found: boolean
  error?: string
}

interface MockProgress {
  found: boolean
  progress?: ProgressState
}

const resultAction = vi.fn(async (_runId: string): Promise<MockResult> => ({ found: false }))
const progressAction = vi.fn(
  async (_runId: string): Promise<MockProgress> => ({
    found: true,
    progress: { step: 'GENERATING', completedCount: 1, totalCount: 4 },
  }),
)

vi.mock('@/actions/getPersonaGenerationResult', () => ({
  getPersonaGenerationResultAction: (runId: string) => resultAction(runId),
}))

vi.mock('@/actions/getProgress', () => ({
  getProgressAction: (runId: string) => progressAction(runId),
}))

const activeRuns: string[] = []

beforeEach(() => {
  resultAction.mockClear()
  progressAction.mockClear()
  resultAction.mockImplementation(async () => ({ found: false }))
  progressAction.mockImplementation(async () => ({
    found: true,
    progress: { step: 'GENERATING', completedCount: 1, totalCount: 4 },
  }))
})

afterEach(() => {
  for (const runId of activeRuns.splice(0)) forgetPersonaRun(runId)
})

describe('observePersonaRun', () => {
  it('shares one round trip between observers inside the cadence', async () => {
    const runId = 'shared-run'
    activeRuns.push(runId)

    const [first, second] = await Promise.all([observePersonaRun(runId), observePersonaRun(runId)])

    // Two observers, one fetch each — not two.
    expect(resultAction).toHaveBeenCalledTimes(1)
    expect(progressAction).toHaveBeenCalledTimes(1)
    expect(first.progress?.step).toBe('GENERATING')
    expect(second.progress?.step).toBe('GENERATING')
  })

  it('reuses the last answer inside the cadence and re-fetches after it', async () => {
    vi.useFakeTimers()
    const runId = 'cadence-run'
    activeRuns.push(runId)
    try {
      await observePersonaRun(runId)
      expect(resultAction).toHaveBeenCalledTimes(1)

      // A second observer arriving mid-cadence costs nothing.
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS / 2)
      await observePersonaRun(runId)
      expect(resultAction).toHaveBeenCalledTimes(1)

      // Past the cadence, the next observation polls again.
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS)
      await observePersonaRun(runId)
      expect(resultAction).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a run that stopped reporting as stalled, for every observer', async () => {
    vi.useFakeTimers()
    const runId = 'hung-run'
    activeRuns.push(runId)
    try {
      const first = await observePersonaRun(runId)
      expect(first.stalled).toBe(false)

      await vi.advanceTimersByTimeAsync(PERSONA_RUN_STALL_MS)
      const second = await observePersonaRun(runId)

      expect(second.stalled).toBe(true)
      // The verdict is shared, not consumed by the first observer.
      expect((await observePersonaRun(runId)).stalled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a run alive while it keeps reporting changes', async () => {
    vi.useFakeTimers()
    const runId = 'busy-run'
    activeRuns.push(runId)
    try {
      await observePersonaRun(runId)

      let completed = 1
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(PERSONA_RUN_STALL_MS / 2)
        completed += 1
        progressAction.mockImplementation(async () => ({
          found: true,
          progress: { step: 'GENERATING', completedCount: completed, totalCount: 8 },
        }))
        const observation = await observePersonaRun(runId)
        expect(observation.stalled).toBe(false)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops watching a run whose result has been stored', async () => {
    const runId = 'settled-run'
    activeRuns.push(runId)
    resultAction.mockImplementation(async () => ({ found: true }))

    const observation = await observePersonaRun(runId)

    expect(observation.result?.found).toBe(true)
    expect(observation.stalled).toBe(false)
    // A stored result is the run's outcome: no progress call is needed.
    expect(progressAction).not.toHaveBeenCalled()
  })
})

describe('startPersonaRunPolling', () => {
  it('never starts a tick while the previous one is still running', async () => {
    vi.useFakeTimers()
    try {
      let release!: () => void
      const tick = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )

      const stop = startPersonaRunPolling(tick)
      expect(tick).toHaveBeenCalledTimes(1)

      // Three cadences pass while the first tick hangs.
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS * 3)
      expect(tick).toHaveBeenCalledTimes(1)

      release()
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS)
      expect(tick).toHaveBeenCalledTimes(2)

      stop()
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS * 3)
      expect(tick).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('survives a failing round trip instead of rejecting unhandled', async () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let failNext = true
      const tick = vi.fn(async () => {
        if (failNext) {
          failNext = false
          throw new Error('round trip failed')
        }
      })

      const stop = startPersonaRunPolling(tick)
      await vi.advanceTimersByTimeAsync(PERSONA_RUN_POLL_INTERVAL_MS)

      expect(consoleError).toHaveBeenCalled()
      expect(tick).toHaveBeenCalledTimes(2)
      stop()
    } finally {
      consoleError.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('runStatusText', () => {
  it('maps retry chatter to the step label and logs it instead of showing it', () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    try {
      const text = runStatusText({
        step: 'GENERATING',
        streamingText: "We ran into an issue generating the personas, so we're retrying.",
      })

      expect(text).toBe('Generating personas')
      expect(consoleDebug).toHaveBeenCalled()
    } finally {
      consoleDebug.mockRestore()
    }
  })

  it('passes a genuine status through untouched', () => {
    expect(runStatusText({ step: 'GENERATING', streamingText: 'Writing backstory for Ada' })).toBe(
      'Writing backstory for Ada',
    )
  })

  it('falls back to the step label when the run has no status text', () => {
    expect(runStatusText({ step: 'POOLING' })).toBe('Pooling signals across interviews')
    expect(runStatusText(undefined)).toBe('Generating personas...')
  })
})

describe('runStartedAt', () => {
  it('reads the start time the VPS pipelines stamp into the run id', () => {
    expect(runStartedAt('pi-1791834981801-ab12')).toBe(1791834981801)
    expect(runStartedAt('pt-1791834849719-whlr4')).toBe(1791834849719)
  })

  it('has nothing to say about a locally streamed run id', () => {
    expect(runStartedAt('pipeline-mf1x2y3z-ab12')).toBeNull()
    expect(runStartedAt('retry-run')).toBeNull()
  })
})

describe('the step a run shows', () => {
  it('names known steps from the display table', () => {
    expect(runStatusText({ step: 'INGESTING' } as ProgressState)).toBe('Indexing personas for chat')
    expect(runStatusText({ step: 'ADDING_BEHAVIORAL_DEPTH' } as ProgressState)).toBe('Adding behavioral depth')
  })

  it('title-cases an unknown step rather than showing the raw key', () => {
    expect(runStatusText({ step: 'SOME_NEW_STEP' } as ProgressState)).toBe('Some New Step')
  })

  it('falls back to the generic label before a step is reported', () => {
    expect(runStatusText(undefined)).toBe('Generating personas...')
  })
})
