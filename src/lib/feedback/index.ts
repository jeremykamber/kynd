import { transport } from './transport'
import type { FeedbackOutcome, FeedbackRequest } from './types'

export type {
  FeedbackContext,
  FeedbackKind,
  FeedbackOutcome,
  FeedbackRequest,
} from './types'

/**
 * A message shorter than this is not a report; a stray keystroke or a lone
 * period means the user changed their mind, so the module treats it as empty
 * rather than mailing the team noise.
 */
const MIN_MESSAGE_CHARS = 4

/**
 * Whether a request carries anything worth sending. The dialog uses this to
 * decide whether Send is available and `submitFeedback` uses it to decide
 * whether to send, so the button can never promise more than the module does
 * (a one-word message the module would drop must not close the dialog as if it
 * had gone out).
 */
export function isReportable(request: FeedbackRequest): boolean {
  const message = request.message?.trim() ?? ''
  const error = request.context?.error?.trim() ?? ''
  return message.length >= MIN_MESSAGE_CHARS || error.length > 0
}

/**
 * The `mailto:` hand-off travels through a URL, and browsers and mail clients
 * truncate a long one (commonly around 2000 characters). A pipeline failure
 * reason can be several KB, so the report is capped and the cut is stated
 * rather than left to look like the end of the message.
 */
const MAX_REPORT_CHARS = 1800

/**
 * Turns the user's words plus whatever the caller knows into one plain-text
 * report. Absent facts are omitted rather than written as blanks, so a short
 * report stays readable in a mail client.
 */
function buildReport(request: FeedbackRequest, message: string): string {
  const context = request.context ?? {}
  const route = context.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined)
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined

  const lines = [`Kynd feedback (${request.kind})`, '']
  if (message) lines.push('Message:', message, '')
  if (request.email) lines.push(`Email: ${request.email}`)
  if (route) lines.push(`Route: ${route}`)
  if (userAgent) lines.push(`User agent: ${userAgent}`)
  if (context.error) lines.push(`Error: ${context.error}`)
  if (context.runId) lines.push(`Run id: ${context.runId}`)
  if (context.summary) lines.push(`Summary: ${context.summary}`)

  const report = lines.join('\n').trim()
  if (report.length <= MAX_REPORT_CHARS) return report
  const dropped = report.length - MAX_REPORT_CHARS
  return `${report.slice(0, MAX_REPORT_CHARS)}\n\n[truncated: ${dropped} more characters]`
}

/**
 * The only entry point callers should use. Assembles the report and hands it to
 * the transport without ever throwing into the UI: a request with nothing in it
 * (no message and no error context) is a no-op, and a transport that cannot
 * open returns `{ opened: false }`.
 */
export async function submitFeedback(request: FeedbackRequest): Promise<FeedbackOutcome> {
  if (!isReportable(request)) return { opened: false }

  const message = request.message?.trim() ?? ''

  try {
    return await transport.send(buildReport(request, message))
  } catch {
    return { opened: false }
  }
}
