import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const { router, searchParams, personaState, analysisState, analysisFlow } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  searchParams: { current: new URLSearchParams() },
  personaState: { batches: [] as unknown[] },
  analysisState: { analyses: [] as unknown[], removeAnalysis: vi.fn(), updateAnalysis: vi.fn() },
  analysisFlow: {
    isPending: false,
    setArtifactUrl: vi.fn(),
    setArtifactImageBase64: vi.fn(),
    setBusinessGoal: vi.fn(),
    setResearchQuestion: vi.fn(),
    handleAnalyzeArtifact: vi.fn(),
    handleCancel: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams.current,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : undefined} {...rest}>{children}</a>
  ),
}))

vi.mock('@/ui/stores/personaStore', () => ({
  usePersonaStore: (selector: (s: { batches: unknown[] }) => unknown) => selector(personaState),
}))

vi.mock('@/ui/stores/analysisStore', () => ({
  useAnalysisStore: (selector: (s: typeof analysisState) => unknown) => selector(analysisState),
}))

vi.mock('@/ui/hooks/useAnalysisFlow', () => ({
  useAnalysisFlow: () => analysisFlow,
}))

// Radix Select needs a real DOM environment it does not have in jsdom; the
// form's behavior under test does not depend on it.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import AnalysesPage from '../page'

const BATCH = {
  id: 'batch-1',
  label: 'Test Batch',
  source: 'description',
  createdAt: '2026-01-01T00:00:00.000Z',
  personas: [],
}

const ANALYSIS = {
  id: 'a1',
  name: 'Run',
  status: 'COMPLETED',
  url: 'https://example.com',
  personaCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
}

afterEach(cleanup)

beforeEach(() => {
  searchParams.current = new URLSearchParams()
  personaState.batches = [BATCH]
  analysisState.analyses = []
  analysisFlow.isPending = false
  router.push.mockClear()
  router.replace.mockClear()
  analysisState.removeAnalysis.mockClear()
  analysisState.updateAnalysis.mockClear()
  analysisFlow.handleCancel.mockClear()
})

describe('AnalysesPage — ?new=1 opens the new-analysis form', () => {
  it('keeps the form closed when the flag is absent', () => {
    render(<AnalysesPage />)

    expect(screen.getByRole('heading', { name: 'Analyses' })).toBeTruthy()
    expect(screen.queryByLabelText('Artifact URL')).toBeNull()
  })

  it('opens the form when the URL carries new=1', () => {
    searchParams.current = new URLSearchParams('new=1')

    render(<AnalysesPage />)

    expect(screen.queryByLabelText('Artifact URL')).toBeTruthy()
  })

  it('writes the flag to the URL when Run New Analysis is toggled open', () => {
    render(<AnalysesPage />)

    fireEvent.click(screen.getByRole('button', { name: /run new analysis/i }))

    expect(router.replace).toHaveBeenCalledWith('/dashboard/analyses?new=1', { scroll: false })
  })

  it('clears the flag from the URL when the form is toggled closed', () => {
    searchParams.current = new URLSearchParams('new=1')
    render(<AnalysesPage />)

    fireEvent.click(screen.getByRole('button', { name: /run new analysis/i }))

    expect(router.replace).toHaveBeenCalledWith('/dashboard/analyses', { scroll: false })
  })
})

describe('AnalysesPage — failed runs are not counted as completed', () => {
  it('groups an errored run under Failed and keeps it out of Completed', () => {
    analysisState.analyses = [
      { ...ANALYSIS, id: 'done', name: 'Good run' },
      { ...ANALYSIS, id: 'bad', name: 'Bad run', status: 'ERROR', error: 'boom' },
    ]

    render(<AnalysesPage />)

    expect(screen.getByRole('heading', { name: 'Completed' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Failed' })).toBeTruthy()
    expect(screen.getByText('1 completed · 1 failed · 0 in progress')).toBeTruthy()
  })

  it('omits the failed count and section when nothing has failed', () => {
    analysisState.analyses = [{ ...ANALYSIS }]

    render(<AnalysesPage />)

    expect(screen.queryByRole('heading', { name: 'Failed' })).toBeNull()
    expect(screen.getByText('1 completed · 0 in progress')).toBeTruthy()
  })
})

describe('AnalysesPage — a run is announced from the store, not from the hook', () => {
  it('keeps the running banner and the card when only the store knows about the run', () => {
    analysisFlow.isPending = false
    analysisState.analyses = [
      { ...ANALYSIS, id: 'live', status: 'IN_PROGRESS', completedResponses: 0, totalResponses: 3 },
    ]

    render(<AnalysesPage />)

    expect(screen.getByText(/analysis is running/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeTruthy()
  })

  it('drops the banner once the run settles', () => {
    analysisState.analyses = [{ ...ANALYSIS, id: 'live' }]

    render(<AnalysesPage />)

    expect(screen.queryByText(/analysis is running/i)).toBeNull()
  })
})

describe('AnalysesPage — cancelling a live run', () => {
  it('offers Cancel on an in-progress run and passes the run id to the flow', () => {
    analysisState.analyses = [
      { ...ANALYSIS, id: 'live', status: 'IN_PROGRESS', completedResponses: 1, totalResponses: 3 },
    ]

    render(<AnalysesPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(analysisFlow.handleCancel).toHaveBeenCalledWith('live')
  })

  it('offers no Cancel on a settled run', () => {
    analysisState.analyses = [{ ...ANALYSIS }]

    render(<AnalysesPage />)

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})

describe('AnalysesPage — deleting a run', () => {
  it('asks first, and deletes only on confirm', async () => {
    analysisState.analyses = [{ ...ANALYSIS, id: 'done' }]

    render(<AnalysesPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete analysis' }))

    expect(await screen.findByText('Delete this analysis?')).toBeTruthy()
    expect(screen.getByText('This action cannot be undone.')).toBeTruthy()
    expect(analysisState.removeAnalysis).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(analysisState.removeAnalysis).toHaveBeenCalledWith('done')
  })
})

describe('AnalysesPage — one primary run CTA per view', () => {
  const primaryRunCtas = () =>
    screen
      .getAllByRole('button', { name: /run .*analysis/i })
      .filter((button) => button.className.includes('bg-primary'))

  it('leaves the list with a single primary CTA', () => {
    analysisState.analyses = [{ ...ANALYSIS }]

    render(<AnalysesPage />)

    expect(primaryRunCtas()).toHaveLength(1)
    expect(primaryRunCtas()[0].textContent).toMatch(/run new analysis/i)
  })

  it('demotes the form toggle while the form is open, leaving the submit the only primary CTA', () => {
    searchParams.current = new URLSearchParams('new=1')

    render(<AnalysesPage />)

    expect(primaryRunCtas()).toHaveLength(1)
    expect(primaryRunCtas()[0].textContent).toMatch(/^run analysis$/i)
  })
})
