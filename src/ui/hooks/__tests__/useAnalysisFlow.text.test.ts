/**
 * The flow's record for a text run: the input kind, label, file names and text
 * must be persisted, and a text run must not start screenshot polling (it has
 * no browser to capture from). The URL path keeps polling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Persona } from '@/domain/entities/Persona'

const mocks = vi.hoisted(() => ({
  analyzeArtifactAction: vi.fn(),
  getScreenshotAction: vi.fn(),
  getProgressAction: vi.fn(),
  getAnalysisResultAction: vi.fn(),
  cancelRequestAction: vi.fn(),
}))

vi.mock('@/actions/analyzeArtifactAction', () => ({ analyzeArtifactAction: mocks.analyzeArtifactAction }))
vi.mock('@/actions/getScreenshot', () => ({ getScreenshotAction: mocks.getScreenshotAction }))
vi.mock('@/actions/getProgress', () => ({ getProgressAction: mocks.getProgressAction }))
vi.mock('@/actions/getAnalysisResult', () => ({ getAnalysisResultAction: mocks.getAnalysisResultAction }))
vi.mock('@/actions/cancelRequest', () => ({ cancelRequestAction: mocks.cancelRequestAction }))
vi.mock('@/infrastructure/services/indexedDBStorage', () => ({
  indexedDBStorage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}))

import { useAnalysisFlow } from '../useAnalysisFlow'
import { useAnalysisStore } from '@/ui/stores/analysisStore'

function persona(name: string): Persona {
  return {
    id: `p-${name}`,
    name,
    age: 30,
    occupation: 'designer',
    educationLevel: 'BA',
    interests: [],
    goals: [],
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
    values: [],
    fears: [],
    communicationStyle: 'direct',
    decisionStyle: 'gut-driven',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAnalysisStore.setState({ analyses: [], dismissedAnalysisIds: [] })
  mocks.getScreenshotAction.mockResolvedValue({ found: false })
  mocks.getProgressAction.mockResolvedValue({ found: false })
  // The run stays in flight (nothing found), so polling behaviour is observable.
  mocks.getAnalysisResultAction.mockResolvedValue({ found: false })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAnalysisFlow — text runs', () => {
  it('records the text source and never polls for a screenshot', async () => {
    mocks.analyzeArtifactAction.mockResolvedValue({ streamData: undefined, requestId: 'req-1' })

    const { result } = renderHook(() => useAnalysisFlow())
    act(() => {
      result.current.handleAnalyzeArtifact(
        [persona('Ada')],
        { type: 'text', text: 'Feature brief body.', label: 'brief.md', files: ['brief.md'] },
        'goal',
        'rq',
        'batch-1',
      )
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2300)
    })

    const [record] = useAnalysisStore.getState().analyses
    expect(record).toMatchObject({
      inputKind: 'text',
      label: 'brief.md',
      text: 'Feature brief body.',
      sourceFiles: ['brief.md'],
      // `url` stays a URL; the label is what the detail header and PDF render.
      url: '',
      name: 'Analysis — brief.md',
      batchId: 'batch-1',
      status: 'IN_PROGRESS',
    })
    expect(mocks.getScreenshotAction).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleCancel()
    })
  })

  it('still polls for a screenshot on a screenshot run', async () => {
    mocks.analyzeArtifactAction.mockResolvedValue({ streamData: undefined, requestId: 'req-2' })

    const { result } = renderHook(() => useAnalysisFlow())
    act(() => {
      result.current.handleAnalyzeArtifact(
        [persona('Ada')],
        { type: 'screenshot', imageBase64: 'data:image/png;base64,AAAA' },
      )
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2300)
    })

    expect(mocks.getScreenshotAction).toHaveBeenCalledWith('req-2')

    await act(async () => {
      await result.current.handleCancel()
    })
  })
})
