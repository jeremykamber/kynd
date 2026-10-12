/**
 * Engine failures, written for the person who ran the analysis.
 *
 * What a failed run produces is diagnostic text: a `page.goto` call log, a
 * `net::ERR_NAME_NOT_RESOLVED`, a provider timeout in milliseconds. It is
 * evidence for whoever debugs the run, and it used to be persisted and
 * rendered verbatim — in the run's error strip, a persona's report card, the
 * list row and the PDF. The reader needs to know what happened to *their* run
 * and what to do next, so the translation happens once, where the raw text is
 * first caught: the analyze action and the VPS analyze route (which log the
 * raw text) and `analysisStore.markError`, the last boundary before untrusted
 * error text becomes display state.
 *
 * A sentence that is already user-facing passes through unchanged, so
 * classifying at more than one boundary cannot degrade copy that another
 * layer wrote.
 */

export const ANALYSIS_ERROR_COPY = {
  /** The artifact could not be loaded at all: DNS, connection, SSL, capture. */
  unreachable: "We couldn't load that page. Check the URL and try again.",
  /** The run (page or model) exceeded its time budget. */
  timeout: 'That run took too long to finish. Please try again.',
  cancelled: 'This analysis was cancelled before it finished.',
  /** The model provider refused the call: credentials, quota, an HTTP status. */
  unavailable: 'The analysis service is unavailable right now. Please try again in a few minutes.',
  /** Last resort: never render engine text we could not classify. */
  generic: 'Something went wrong while running this analysis. Please try again.',
} as const

// Loading failures across the layers that can produce them: Playwright's
// navigation errors, Node's resolver/connection errors, and the intake
// adapter's own "Failed to capture artifact" wrapper.
const LOAD_FAILURE =
  /net::ERR|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET|ERR_ADDRESS|ERR_CERT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|could not load|did not respond|failed to capture|navigation failed|NS_ERROR/i

const CANCELLED = /cancel/i
const TIMEOUT = /timed?\s?out|timeout|ETIMEDOUT/i
// Provider-shaped refusals. A bare HTTP status ("401 User not found.") reads
// like a sentence but is not one — lead with the status code, not "401st".
const PROVIDER =
  /^[\s"']*[1-5]\d\d\b|unauthorized|invalid api key|api key|user not found|quota|insufficient|payment required|provider (error|refused|unavailable)|overloaded|no such model/i
// Shapes no sentence has: a stack frame, a call log, an unparsed blob.
const ENGINE_NOISE = /call log|\bat .*:\d+:\d+|^\s*[{[<]|unhandled|stack trace/i

/**
 * A user-facing sentence for `raw`: the matching copy for a recognised engine
 * failure, the text itself when it already reads as a sentence, and the
 * generic line for anything else. Empty input yields the generic line.
 */
export function humanizeAnalysisError(raw: string | null | undefined): string {
  const text = (raw ?? '').trim()
  if (!text) return ANALYSIS_ERROR_COPY.generic
  if (LOAD_FAILURE.test(text)) return ANALYSIS_ERROR_COPY.unreachable
  if (CANCELLED.test(text)) return ANALYSIS_ERROR_COPY.cancelled
  if (TIMEOUT.test(text)) return ANALYSIS_ERROR_COPY.timeout
  if (PROVIDER.test(text)) return ANALYSIS_ERROR_COPY.unavailable
  if (text.includes('\n') || ENGINE_NOISE.test(text)) return ANALYSIS_ERROR_COPY.generic
  return text
}
