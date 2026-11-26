import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { AnalysisToaster } from '../AnalysisToaster'
import { useAnalysisStore } from '@/ui/stores/analysisStore'

// The toaster is the only progress poller mounted on every page, so it must
// carry every progress field the run produces — including the AI-generated
// simulation title. A run started on one page and read on another would
// otherwise keep its heuristic name forever.

const getProgressAction = vi.fn()
const getAnalysisResultAction = vi.fn()

vi.mock('@/actions/getProgress', () => ({
  getProgressAction: (...args: unknown[]) => getProgressAction(...args),
}))

vi.mock('@/actions/getAnalysisResult', () => ({
  getAnalysisResultAction: (...args: unknown[]) => getAnalysisResultAction(...args),
}))

vi.mock('sonner', () => ({
  toast: { custom: vi.fn() },
}))

const ANALYSIS_ID = 'analysis-title-test'

function seedAnalysis(): void {
  useAnalysisStore.getState().addAnalysis({
    id: ANALYSIS_ID,
    name: 'Analysis — dreamwriter',
    url: 'https://dreamwriter.ai/',
    inputKind: 'url',
    status: 'IN_PROGRESS',
    personaCount: 10,
    createdAt: new Date().toISOString(),
    currentStep: 'STARTING',
    completedResponses: 0,
    totalResponses: 10,
  })
}

beforeEach(() => {
  getProgressAction.mockReset()
  getAnalysisResultAction.mockReset()
  getAnalysisResultAction.mockResolvedValue({ found: false })
  useAnalysisStore.getState().removeAnalysis(ANALYSIS_ID)
})

afterEach(() => {
  cleanup()
  useAnalysisStore.getState().removeAnalysis(ANALYSIS_ID)
})

describe('AnalysisToaster', () => {
  it('renames the analysis with the AI title reported by progress', async () => {
    getProgressAction.mockResolvedValue({
      found: true,
      progress: {
        step: 'ANALYZING',
        completedCount: 3,
        totalCount: 10,
        title: 'Does pop-up distract users from booking a demo?',
      },
    })

    vi.useFakeTimers()
    try {
      render(<AnalysisToaster />)
      act(() => {
        seedAnalysis()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      const stored = useAnalysisStore.getState().getAnalysis(ANALYSIS_ID)
      expect(stored?.name).toBe('Does pop-up distract users from booking a demo?')
    } finally {
      vi.useRealTimers()
    }
  })
})
