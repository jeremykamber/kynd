/**
 * The feedback module's vocabulary. Kept separate from `index.ts` and
 * `transport.ts` so the transport can name the outcome type without importing
 * the module's assembly code.
 */

export type FeedbackKind = 'general' | 'error'

/** Facts attached to a report that the user never types. All optional: a report with none still carries the route and user agent. */
export interface FeedbackContext {
  route?: string
  error?: string
  runId?: string
  summary?: string
}

export interface FeedbackRequest {
  kind: FeedbackKind
  message?: string
  email?: string
  context?: FeedbackContext
}

export interface FeedbackOutcome {
  opened: boolean
}
