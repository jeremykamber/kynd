import { describe, it, expect } from 'vitest'
import type { ArtifactAnalysis } from '../ArtifactAnalysis'
import { analysisInputKind, analysisSourceLabel, generateAnalysisName } from '../ArtifactAnalysis'

function record(overrides: Partial<ArtifactAnalysis>): ArtifactAnalysis {
  return {
    id: 'a1',
    name: 'Run',
    url: '',
    status: 'COMPLETED',
    personaCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('generateAnalysisName', () => {
  it('keeps the URL naming untouched', () => {
    expect(generateAnalysisName({ kind: 'url', url: 'https://www.jobright.ai/pricing' })).toBe(
      'Analysis — jobright',
    )
    expect(generateAnalysisName({ kind: 'url', url: 'https://acme.com' }, 'Founders')).toBe(
      '"Founders" on acme',
    )
  })

  it('keeps the screenshot naming untouched', () => {
    expect(generateAnalysisName({ kind: 'screenshot' })).toBe('Analysis — Screenshot')
    expect(generateAnalysisName({ kind: 'screenshot' }, 'Founders')).toBe('"Founders" — Screenshot')
  })

  it('names a text run by its label', () => {
    expect(generateAnalysisName({ kind: 'text', label: 'brief.md' })).toBe('Analysis — brief.md')
    expect(generateAnalysisName({ kind: 'text', label: 'Pasted text' }, 'Founders')).toBe(
      '"Founders" — Pasted text',
    )
  })

  it('shortens a long label instead of blowing up the card', () => {
    const name = generateAnalysisName({
      kind: 'text',
      label: 'shared-analyses-brief.docx, pitch-deck.pptx, landing-copy.md, feature-list.csv, copy.txt',
    })
    expect(name.length).toBeLessThanOrEqual('Analysis — '.length + 60)
    expect(name.endsWith('…')).toBe(true)
  })
})

describe('analysis record defaults', () => {
  it('reads the legacy screenshot marker as a screenshot run', () => {
    expect(analysisInputKind(record({ url: 'Screenshot Upload' }))).toBe('screenshot')
    expect(analysisInputKind(record({ url: 'https://acme.com' }))).toBe('url')
  })

  it('prefers the persisted input kind when present', () => {
    expect(analysisInputKind(record({ inputKind: 'text', url: '' }))).toBe('text')
  })

  it('labels screenshot and text runs, and leaves URL runs unlabeled', () => {
    expect(analysisSourceLabel(record({ inputKind: 'screenshot' }))).toBe('Screenshot')
    expect(analysisSourceLabel(record({ inputKind: 'text', label: 'brief.md' }))).toBe('brief.md')
    expect(analysisSourceLabel(record({ inputKind: 'url', url: 'https://acme.com' }))).toBeUndefined()
  })

  it('labels a legacy screenshot record without new fields', () => {
    expect(analysisSourceLabel(record({ url: 'Screenshot Upload' }))).toBe('Screenshot')
  })
})
