import { describe, it, expect, beforeEach } from 'vitest'
import { useAnalysisStore } from '../analysisStore'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'

function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: 'resp-1',
    screenshotBase64: 'img',
    rawAnalysis: 'trace',
    overview: 'ok',
    customerJourney: [],
    researchQuestionAnswer: 'yes',
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    ...overrides,
  }
}

function createAnalysis(overrides?: Partial<ArtifactAnalysis>): ArtifactAnalysis {
  return {
    id: 'analysis-1',
    name: 'Landing page',
    url: 'https://example.com',
    status: 'IN_PROGRESS',
    personaCount: 1,
    personaNames: ['Avery'],
    createdAt: new Date().toISOString(),
    currentStep: 'STARTING',
    completedResponses: 0,
    totalResponses: 1,
    ...overrides,
  }
}

/** The record the card, the toast, the report and the hook all read. */
const storedRun = () => useAnalysisStore.getState().analyses[0]

describe('analysisStore terminal statuses', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ analyses: [], dismissedAnalysisIds: [] })
    useAnalysisStore.getState().addAnalysis(createAnalysis())
  })

  it('cancels a run that is still in progress', () => {
    useAnalysisStore.getState().markCancelled('analysis-1')

    expect(storedRun().status).toBe('CANCELLED')
    expect(storedRun().completedAt).toBeTruthy()
  })

  it('does not let a late cancel discard a completed result', () => {
    // The window this guards: the poller has read the result, and a toast or a
    // card that last saw the run in flight cancels it a moment later.
    useAnalysisStore.getState().markComplete('analysis-1', [response()])
    useAnalysisStore.getState().markCancelled('analysis-1')

    expect(storedRun().status).toBe('COMPLETED')
    expect(storedRun().responses).toHaveLength(1)
  })

  it('does not let a late error replace a completed result', () => {
    useAnalysisStore.getState().markComplete('analysis-1', [response()])
    useAnalysisStore.getState().markError('analysis-1', 'Analysis was error.')

    expect(storedRun().status).toBe('COMPLETED')
    expect(storedRun().error).toBeUndefined()
  })

  it('does not let a late failure replace a cancelled run', () => {
    useAnalysisStore.getState().markCancelled('analysis-1')
    useAnalysisStore.getState().markError('analysis-1', 'Analysis was error.')

    expect(storedRun().status).toBe('CANCELLED')
  })

  it('lets a result supersede a cancellation that raced it', () => {
    // The server had already produced the report when the cancel arrived, so
    // the cancel stopped nothing and the work is the honest outcome.
    useAnalysisStore.getState().markCancelled('analysis-1')
    useAnalysisStore.getState().markComplete('analysis-1', [response()])

    expect(storedRun().status).toBe('COMPLETED')
    expect(storedRun().responses).toHaveLength(1)
  })

  it('leaves an unknown id alone', () => {
    useAnalysisStore.getState().markCancelled('nope')
    useAnalysisStore.getState().markComplete('nope', [])

    expect(useAnalysisStore.getState().analyses).toHaveLength(1)
    expect(storedRun().status).toBe('IN_PROGRESS')
  })
})
