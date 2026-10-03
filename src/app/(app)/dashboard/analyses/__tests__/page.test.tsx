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

afterEach(cleanup)

beforeEach(() => {
  searchParams.current = new URLSearchParams()
  personaState.batches = [BATCH]
  analysisState.analyses = []
  router.push.mockClear()
  router.replace.mockClear()
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
