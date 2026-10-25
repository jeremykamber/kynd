import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { router, searchParams, personaState, analysisState, analysisFlow } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  searchParams: { current: new URLSearchParams() },
  personaState: { batches: [] as unknown[] },
  analysisState: { analyses: [] as unknown[], removeAnalysis: vi.fn(), updateAnalysis: vi.fn() },
  analysisFlow: {
    isPending: false,
    setArtifactSource: vi.fn(),
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
  analysisFlow.handleAnalyzeArtifact.mockClear()
  analysisFlow.setArtifactSource.mockClear()
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
  const baseAnalysis = {
    id: 'a1',
    name: 'Run',
    status: 'COMPLETED',
    url: 'https://example.com',
    personaCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('groups an errored run under Failed and keeps it out of Completed', () => {
    analysisState.analyses = [
      { ...baseAnalysis, id: 'done', name: 'Good run' },
      { ...baseAnalysis, id: 'bad', name: 'Bad run', status: 'ERROR', error: 'boom' },
    ]

    render(<AnalysesPage />)

    expect(screen.getByRole('heading', { name: 'Completed' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Failed' })).toBeTruthy()
    expect(screen.getByText('1 completed · 1 failed · 0 in progress')).toBeTruthy()
  })

  it('omits the failed count and section when nothing has failed', () => {
    analysisState.analyses = [{ ...baseAnalysis }]

    render(<AnalysesPage />)

    expect(screen.queryByRole('heading', { name: 'Failed' })).toBeNull()
    expect(screen.getByText('1 completed · 0 in progress')).toBeTruthy()
  })
})

/** Radix Tabs activates a trigger on mouse-down, not on click. */
function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false })
}

describe('AnalysesPage — the three artifact tabs', () => {
  beforeEach(() => {
    searchParams.current = new URLSearchParams('new=1')
  })

  it('offers URL, Upload, and Text and starts on URL', () => {
    render(<AnalysesPage />)

    for (const tab of ['URL', 'Upload', 'Text']) {
      expect(screen.getByRole('tab', { name: tab })).toBeTruthy()
    }
    expect(screen.getByLabelText('Artifact URL')).toBeTruthy()
    expect(screen.queryByLabelText('Artifact Text')).toBeNull()
  })

  it('runs pasted text from the Text tab', () => {
    render(<AnalysesPage />)

    openTab('Text')
    fireEvent.change(screen.getByLabelText('Artifact Text'), {
      target: { value: 'Feature brief: share a read-only analysis link.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

    expect(analysisFlow.handleAnalyzeArtifact).toHaveBeenCalledWith(
      [],
      {
        type: 'text',
        text: 'Feature brief: share a read-only analysis link.',
        label: 'Pasted text',
      },
      '',
      '',
      'batch-1',
    )
    expect(analysisFlow.setArtifactSource).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text' }),
    )
  })

  it('counts characters, rejects text past the cap, and disables the run', () => {
    render(<AnalysesPage />)

    openTab('Text')
    const textarea = screen.getByLabelText('Artifact Text')

    fireEvent.change(textarea, { target: { value: 'abc' } })
    expect(screen.getByText('3 / 80,000 characters')).toBeTruthy()

    fireEvent.change(textarea, { target: { value: 'x'.repeat(80_001) } })
    expect(screen.getByText('80,001 / 80,000 characters')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('80,000 limit')
    expect(screen.getByRole('button', { name: 'Run Analysis' }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps the run disabled when pasted text is only whitespace', () => {
    render(<AnalysesPage />)

    openTab('Text')
    fireEvent.change(screen.getByLabelText('Artifact Text'), { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: 'Run Analysis' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('AnalysesPage — multi-document upload', () => {
  /** jsdom's File has no arrayBuffer(); the browser's does. Adds just that seam. */
  function fileWithBytes(name: string, content: string, type = 'text/plain'): File {
    const file = new File([content], name, { type })
    return Object.assign(file, {
      arrayBuffer: async () => new TextEncoder().encode(content).buffer,
    })
  }

  function uploadFiles(container: HTMLElement, files: File[]) {
    const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement
    fireEvent.change(input, { target: { files } })
  }

  it('lists documents with sizes, extracts text, and updates the totals on remove', async () => {
    searchParams.current = new URLSearchParams('new=1')
    const { container } = render(<AnalysesPage />)

    openTab('Upload')
    uploadFiles(container, [
      fileWithBytes('first.txt', 'first brief'),
      fileWithBytes('second.txt', 'second brief'),
    ])

    expect(await screen.findByText('first.txt')).toBeTruthy()
    expect(screen.getByText('second.txt')).toBeTruthy()
    expect(await screen.findByText('2 of 5 documents · 45 characters')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove second.txt' }))

    await waitFor(() => {
      expect(screen.queryByText('second.txt')).toBeNull()
    })
    expect(await screen.findByText('1 of 5 documents · 11 characters')).toBeTruthy()
  })

  it('rejects a legacy .doc with export instructions', async () => {
    searchParams.current = new URLSearchParams('new=1')
    const { container } = render(<AnalysesPage />)

    openTab('Upload')
    uploadFiles(container, [fileWithBytes('old-brief.doc', 'x', 'application/msword')])

    expect((await screen.findByRole('alert')).textContent).toContain('Export it to PDF or DOCX first.')
  })
})
