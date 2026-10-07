import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'

const addFile = vi.hoisted(() => vi.fn())

vi.mock('@/ui/hooks/useInterviewPipeline', () => ({
  useInterviewPipeline: () => ({
    files: [],
    addFile,
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    personas: null,
    error: null,
    isPending: false,
    progress: null,
    personaCount: 3,
    setPersonaCount: vi.fn(),
    generationMode: 'individual',
    setGenerationMode: vi.fn(),
    handleSubmit: vi.fn(),
    handleCancel: vi.fn(),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: React.ComponentProps<'a'>) => <a {...rest}>{children}</a>,
}))

vi.mock('lucide-react', () => ({
  Upload: () => null,
  FileText: () => null,
  XIcon: () => null,
  CheckCircle2: () => null,
  LayersIcon: () => null,
}))

vi.mock('@/components/custom/FlowDialog', () => ({
  FlowDialog: () => null,
}))

import { InterviewUploadClient } from '../InterviewUploadClient'

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

describe('InterviewUploadClient — transcript validation', () => {
  beforeEach(() => {
    addFile.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('rejects a .pdf from the file picker with a visible message and adds no file', async () => {
    const { container } = render(<InterviewUploadClient />)
    const pdf = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' })

    await act(async () => {
      fireEvent.change(fileInput(container), { target: { files: [pdf] } })
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('only .txt transcripts are supported')
    expect(alert.textContent).toContain('report.pdf')
    expect(addFile).not.toHaveBeenCalled()
  })

  it('accepts an uppercase .TXT and adds it without a rejection message', async () => {
    const { container } = render(<InterviewUploadClient />)
    const txt = new File(['hello'], 'notes.TXT', { type: 'text/plain' })

    await act(async () => {
      fireEvent.change(fileInput(container), { target: { files: [txt] } })
      await vi.waitFor(() => expect(addFile).toHaveBeenCalled())
    })

    expect(addFile).toHaveBeenCalledWith('notes.TXT', 'hello')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects a dropped .pdf and adds no file', async () => {
    render(<InterviewUploadClient />)
    const dropzone = screen.getByText('Drop transcripts here or click to browse')
      .parentElement as HTMLElement
    const pdf = new File(['%PDF-1.7'], 'deck.pdf', { type: 'application/pdf' })

    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [pdf] } })
    })

    expect((await screen.findByRole('alert')).textContent).toContain('deck.pdf')
    expect(addFile).not.toHaveBeenCalled()
  })

  it('adds supported files and reports the unsupported ones in a mixed selection', async () => {
    const { container } = render(<InterviewUploadClient />)
    const good = new File(['hi'], 'a.txt', { type: 'text/plain' })
    const bad = new File(['x'], 'b.docx')

    await act(async () => {
      fireEvent.change(fileInput(container), { target: { files: [good, bad] } })
      await vi.waitFor(() => expect(addFile).toHaveBeenCalled())
    })

    expect(addFile).toHaveBeenCalledTimes(1)
    expect(addFile).toHaveBeenCalledWith('a.txt', 'hi')
    expect((await screen.findByRole('alert')).textContent).toContain('b.docx')
  })
})
