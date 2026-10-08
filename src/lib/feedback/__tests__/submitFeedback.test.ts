import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isReportable, submitFeedback } from '../index'

// The module's whole job is to turn what the caller knows into one report and
// reach the destination with it. The transport is the swappable seam, but the
// assembly and the recipient are what decide whether the report arrives at all,
// so they are asserted here against the real transport rather than a stub.

let href = ''

beforeEach(() => {
  href = ''
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname: '/dashboard/analyses/abc',
      get href() {
        return href
      },
      set href(value: string) {
        href = value
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The decoded body of the mailto: the transport handed over. */
function bodyOf(url: string): string {
  const body = new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('body')
  return body ?? ''
}

describe('submitFeedback', () => {
  it('does nothing when the user typed nothing and nothing failed', async () => {
    const outcome = await submitFeedback({ kind: 'general', message: '  ' })
    expect(outcome).toEqual({ opened: false })
    expect(href).toBe('')
  })

  it('treats a stray keystroke as nothing and a real message as reportable', async () => {
    // The dialog asks this same question before enabling Send, so a report the
    // module would drop must never look like it went out.
    expect(isReportable({ kind: 'general', message: 'bug' })).toBe(false)
    expect(isReportable({ kind: 'general', message: '  ' })).toBe(false)
    expect(isReportable({ kind: 'general', message: 'the bar is stuck' })).toBe(true)
    expect(isReportable({ kind: 'error' })).toBe(false)
    expect(isReportable({ kind: 'error', context: { error: 'boom' } })).toBe(true)

    await submitFeedback({ kind: 'general', message: 'bug' })
    expect(href).toBe('')
  })

  it('hands the message, the route and the user agent to the mail client', async () => {
    const outcome = await submitFeedback({ kind: 'general', message: 'The bar sticks at 60%' })

    expect(outcome).toEqual({ opened: true })
    expect(href.startsWith('mailto:jeremy@bringforthstudio.com?')).toBe(true)
    const body = bodyOf(href)
    expect(body).toContain('The bar sticks at 60%')
    expect(body).toContain('Kynd feedback (general)')
    expect(body).toContain('Route: /dashboard/analyses/abc')
    expect(body).toContain('User agent:')
  })

  it('reports an error with no message typed, because the error is the message', async () => {
    const outcome = await submitFeedback({
      kind: 'error',
      context: { error: 'PersonaAdapter: non-verbatim evidence', runId: 'pipeline-7' },
    })

    expect(outcome).toEqual({ opened: true })
    const body = bodyOf(href)
    expect(body).toContain('Kynd feedback (error)')
    expect(body).toContain('PersonaAdapter: non-verbatim evidence')
    expect(body).toContain('Run id: pipeline-7')
  })

  it('truncates a several-KB failure reason instead of letting the URL cut it', async () => {
    const longError = 'x'.repeat(9000)
    await submitFeedback({ kind: 'error', context: { error: longError } })

    const body = bodyOf(href)
    expect(body).toContain('[truncated:')
    // The whole URL stays inside what mail clients accept.
    expect(href.length).toBeLessThan(4000)
  })

  it('sends to the configured recipient when one is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEEDBACK_EMAIL', 'someone@example.com')
    await submitFeedback({ kind: 'general', message: 'hello there' })
    expect(href.startsWith('mailto:someone@example.com?')).toBe(true)
  })
})
