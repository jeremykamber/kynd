import { describe, it, expect } from 'vitest'
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_TEXT_CHARS,
  documentKindOf,
  documentSeparator,
  validateDocumentSelection,
  validateImageFile,
  validateTextArtifact,
  validateTextLength,
} from '../ArtifactIntakeLimits'

describe('artifact intake limits', () => {
  it('caps text at 80,000 characters and names the overage', () => {
    expect(MAX_TEXT_CHARS).toBe(80_000)
    expect(validateTextLength(MAX_TEXT_CHARS)).toBeNull()
    expect(validateTextLength(MAX_TEXT_CHARS + 234)).toBe(
      'Text is 80,234 characters — 234 over the 80,000 limit. Trim 234 characters.',
    )
  })

  it('rejects empty text but accepts whitespace inside text', () => {
    expect(validateTextArtifact({ type: 'text', text: '  ' })).toBe(
      'Pasted text is empty. Paste the document text or upload a file.',
    )
    expect(validateTextArtifact({ type: 'text', text: 'a b' })).toBeNull()
  })

  it('accepts the documented formats', () => {
    expect(documentKindOf('brief.PDF')).toBe('pdf')
    expect(documentKindOf('notes.markdown')).toBe('md')
    expect(documentKindOf('photo.png')).toBeNull()
  })

  it('names documents in the concatenation separator', () => {
    expect(documentSeparator('brief.md')).toBe('\n\n=== brief.md ===\n\n')
  })

  it('rejects a sixth document, naming the cap', () => {
    const files = Array.from({ length: MAX_DOCUMENTS + 1 }, (_, i) => ({ name: `note-${i}.txt`, size: 10 }))
    expect(validateDocumentSelection(files)).toBe('You can add up to 5 documents per run.')
  })

  it('rejects a document over 20 MB', () => {
    expect(validateDocumentSelection([{ name: 'deck.pdf', size: MAX_DOCUMENT_BYTES + 1 }])).toBe(
      '"deck.pdf" is 20 MB. Each document must be under 20 MB.',
    )
  })

  it('rejects images outside the three accepted types and over 10 MB', () => {
    expect(validateImageFile({ name: 'a.gif', size: 10, type: 'image/gif' })).toBe(
      'Only PNG, JPG, and WEBP images are accepted.',
    )
    expect(validateImageFile({ name: 'a.png', size: 11 * 1024 * 1024, type: 'image/png' })).toBe(
      'Image must be under 10 MB.',
    )
    expect(validateImageFile({ name: 'a.png', size: 1024, type: 'image/png' })).toBeNull()
  })
})
