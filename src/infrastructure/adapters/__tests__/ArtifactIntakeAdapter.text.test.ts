import { describe, it, expect, vi } from 'vitest'
import { ArtifactIntakeAdapter } from '../ArtifactIntakeAdapter'
import type { BrowserServicePort } from '@/domain/ports/BrowserServicePort'
import type { LlmServicePort } from '@/domain/ports/LlmServicePort'

function makeAdapter() {
  const browser = {
    navigateTo: vi.fn(),
    captureViewport: vi.fn(),
    getCleanedHtml: vi.fn(),
    close: vi.fn(),
  } as unknown as BrowserServicePort
  const llm = { summarizeHtml: vi.fn() } as unknown as LlmServicePort
  return { adapter: new ArtifactIntakeAdapter(browser, llm), browser, llm }
}

describe('ArtifactIntakeAdapter — text artifacts', () => {
  it('passes extracted text through without touching the browser', async () => {
    const { adapter, browser, llm } = makeAdapter()
    const progress: string[] = []

    const intake = await adapter.intake(
      { type: 'text', text: 'A feature brief about sharing.', label: 'brief.md', files: ['brief.md'] },
      (step) => progress.push(step),
    )

    expect(intake).toEqual({ text: 'A feature brief about sharing.', label: 'brief.md' })
    expect(intake.screenshotBase64).toBeUndefined()
    expect(progress).toEqual(['COMPLETE'])
    expect(browser.navigateTo).not.toHaveBeenCalled()
    expect(browser.captureViewport).not.toHaveBeenCalled()
    expect(llm.summarizeHtml).not.toHaveBeenCalled()
  })

  it('labels unlabeled pasted text', async () => {
    const { adapter } = makeAdapter()
    const intake = await adapter.intake({ type: 'text', text: 'pasted copy' })
    expect(intake.label).toBe('Pasted text')
  })

  it('rejects empty text with a specific message', async () => {
    const { adapter } = makeAdapter()
    await expect(adapter.intake({ type: 'text', text: '  \n ' })).rejects.toThrow(
      'Pasted text is empty. Paste the document text or upload a file.',
    )
  })

  it('rejects text over the cap rather than truncating it', async () => {
    const { adapter } = makeAdapter()
    await expect(adapter.intake({ type: 'text', text: 'x'.repeat(80_001) })).rejects.toThrow(
      '80,000 limit',
    )
  })
})
