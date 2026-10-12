import { describe, it, expect } from 'vitest'
import { ANALYSIS_ERROR_COPY, humanizeAnalysisError } from '../analysisError'

describe('humanizeAnalysisError', () => {
  it('translates a Playwright navigation failure into a sentence about the URL', () => {
    const raw = [
      'page.goto: net::ERR_NAME_NOT_RESOLVED at https://definitely-not-real.invalid/',
      'Call log:',
      '  - navigating to "https://definitely-not-real.invalid/", waiting until "networkidle"',
    ].join('\n')

    expect(humanizeAnalysisError(raw)).toBe(ANALYSIS_ERROR_COPY.unreachable)
  })

  it('translates the intake wrapper that carries the same failure', () => {
    expect(
      humanizeAnalysisError(
        'Failed to capture artifact: Could not load https://nope.invalid — the page did not respond (page.goto: Timeout 30000ms exceeded)',
      ),
    ).toBe(ANALYSIS_ERROR_COPY.unreachable)
  })

  it('translates a cancellation', () => {
    expect(humanizeAnalysisError('Request was cancelled')).toBe(ANALYSIS_ERROR_COPY.cancelled)
  })

  it('translates a provider timeout', () => {
    expect(humanizeAnalysisError('Extraction timed out after 240000ms')).toBe(
      ANALYSIS_ERROR_COPY.timeout,
    )
  })

  it('translates a provider refusal that reads like a sentence', () => {
    // A real one: OpenRouter's 401 body reached a persona's failureMessage
    // verbatim before the provider rule existed.
    expect(humanizeAnalysisError('401 User not found.')).toBe(ANALYSIS_ERROR_COPY.unavailable)
    expect(humanizeAnalysisError('429 Too Many Requests')).toBe(ANALYSIS_ERROR_COPY.unavailable)
    expect(humanizeAnalysisError('insufficient credits')).toBe(ANALYSIS_ERROR_COPY.unavailable)
  })

  it('falls back to the generic line for text with no sentence in it', () => {
    expect(humanizeAnalysisError('')).toBe(ANALYSIS_ERROR_COPY.generic)
    expect(humanizeAnalysisError(null)).toBe(ANALYSIS_ERROR_COPY.generic)
    expect(humanizeAnalysisError('{"error":{"code":429}}')).toBe(ANALYSIS_ERROR_COPY.generic)
  })

  it('leaves copy that is already written for a person alone', () => {
    const sentence = 'Rate limit exceeded. Try again in 45 seconds.'
    expect(humanizeAnalysisError(sentence)).toBe(sentence)
    expect(humanizeAnalysisError('Analysis completed with no results')).toBe(
      'Analysis completed with no results',
    )
  })

  it('is idempotent, so classifying at more than one boundary changes nothing', () => {
    for (const copy of Object.values(ANALYSIS_ERROR_COPY)) {
      expect(humanizeAnalysisError(copy)).toBe(copy)
      expect(humanizeAnalysisError(humanizeAnalysisError(copy))).toBe(copy)
    }
  })
})
