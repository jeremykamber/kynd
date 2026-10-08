import type { FeedbackOutcome } from './types'

/**
 * Where a report travels. The rest of the app knows only `submitFeedback`, so
 * swapping the destination is a change to this file alone.
 *
 * Today the destination is email: the report becomes the body of a `mailto:`
 * URL which the OS hands to the user's mail client. The destination is
 * expected to change to a Notion form; when it does, rewrite this file only.
 * The report text and every caller stay as they are.
 */
export interface FeedbackTransport {
  send(report: string): Promise<FeedbackOutcome>
}

const DEFAULT_RECIPIENT = 'jkamberwork@gmail.com'

/**
 * Opens the user's mail client with the report pre-filled. Returning from
 * `send` means the hand-off URL was set, not that a mail client opened, so a
 * missing or refusing client is reported as `{ opened: false }` rather than
 * thrown. Only the URL construction and navigation can fail here.
 */
export const transport: FeedbackTransport = {
  async send(report) {
    if (typeof window === 'undefined') return { opened: false }
    try {
      const recipient = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL || DEFAULT_RECIPIENT
      const query = `subject=${encodeURIComponent('Kynd feedback')}&body=${encodeURIComponent(report)}`
      window.location.href = `mailto:${recipient}?${query}`
      return { opened: true }
    } catch {
      return { opened: false }
    }
  },
}
