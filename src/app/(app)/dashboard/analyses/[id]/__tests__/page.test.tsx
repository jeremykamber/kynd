import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense } from 'react'
import { render, screen, act } from '@testing-library/react'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/actions/getAnalysisResult', () => ({
  getAnalysisResultAction: vi.fn(async () => ({ found: false })),
}))
vi.mock('@/actions/getProgress', () => ({
  getProgressAction: vi.fn(async () => ({ found: false })),
}))

import AnalysisDetailPage from '../page'

const RUN_ID = 'analysis-1'

function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: 'resp-1',
    screenshotBase64: 'img',
    rawAnalysis: 'trace',
    overview: 'REPORTED-OVERVIEW',
    customerJourney: [],
    researchQuestionAnswer: 'REPORTED-ANSWER',
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    ...overrides,
  }
}

const synthesis: ArtifactSynthesis = {
  overview: 'S',
  researchQuestionAnswer: 'A',
  topFindings: [],
  disagreements: [],
  biggestFrictions: [],
  completedCount: 1,
  failedCount: 2,
  totalPersonaCount: 3,
}

const run: ArtifactAnalysis = {
  id: RUN_ID,
  name: 'Landing page',
  url: 'https://example.com',
  status: 'COMPLETED',
  personaCount: 3,
  personaNames: ['Avery', 'Phoenix', 'Taylor'],
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  completedResponses: 1,
  totalResponses: 3,
  synthesis,
  responses: [
    // Carries a report.
    response({ id: 'resp-good', personaId: 'p1', outcome: 'completed' }),
    // Marked failed by the pipeline.
    response({
      id: 'resp-bad',
      personaId: 'p2',
      outcome: 'failed',
      failureMessage: 'MARKED-FAILURE',
      researchQuestionAnswer: 'MARKED-FAILED-ANSWER',
    }),
    // The pre-marker failure the old pipeline wrote: a whole report shape with
    // an apology in it and no marker. It is in browser storage from before the
    // marker existed, and it failed.
    response({
      id: 'resp-legacy',
      personaId: 'p3',
      overview: 'Analysis could not be completed.',
      researchQuestionAnswer: 'LEGACY-FAILED-ANSWER',
      pointsOfFriction: ['the model refused'],
    }),
  ],
}

/**
 * The page reads `params` as a promise, so it suspends on the first render: the
 * boundary resolves it, and the render has to be awaited for React to retry.
 */
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <AnalysisDetailPage params={Promise.resolve({ id: RUN_ID })} />
      </Suspense>,
    )
  })
}

describe('analysis report — a persona whose analysis failed', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ analyses: [run], dismissedAnalysisIds: [] })
  })

  it('shows the failure for a marked failure and for the pre-marker placeholder', async () => {
    await renderPage()

    // A failed persona opens by default: the reason is the only thing it has.
    expect(await screen.findAllByText("This persona's analysis failed")).toHaveLength(2)
    expect(screen.getByText('MARKED-FAILURE')).toBeTruthy()
  })

  it('does not render a failed persona as a report', async () => {
    await renderPage()

    await screen.findAllByText("This persona's analysis failed")

    // The failed personas' own answers never reach the page — inventing a
    // report for them is what made the header contradict the cards.
    expect(screen.queryByText('MARKED-FAILED-ANSWER')).toBeNull()
    expect(screen.queryByText('LEGACY-FAILED-ANSWER')).toBeNull()

    // The completed persona's card is collapsed by default, so its answer is
    // not on screen either — but it is the one that carries a report.
    expect(screen.queryByText('REPORTED-ANSWER')).toBeNull()
  })

  it('counts one of three completed and two failed', async () => {
    await renderPage()

    const summaries = await screen.findAllByText(/personas completed/)
    const summary = summaries.at(-1)

    expect(summary?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '1 of 3 personas completed · 2 failed',
    )
  })
})
