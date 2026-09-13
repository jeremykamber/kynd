/**
 * Human-readable error summaries for toasts.
 *
 * Full error payloads (multi-KB JSON blobs, stack traces) belong in
 * error/debug surfaces — server logs, console, the generating page. Toasts
 * get a concise preview of the first line instead.
 */
export const GENERIC_ERROR_SUMMARY = 'Something went wrong'

const MAX_SUMMARY_CHARS = 160

/**
 * Returns the first non-blank line of `message`, trimmed and capped at 160
 * characters (an ellipsis is appended when truncation happens). JSON/array
 * blobs collapse to `GENERIC_ERROR_SUMMARY`; blank input yields
 * `'Unknown error'`. The result is always a single non-empty line.
 */
export function summarizeError(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) return 'Unknown error'

  // Object/array blobs are not human-readable — never dump them into a toast.
  if (firstLine.startsWith('{') || firstLine.startsWith('[')) return GENERIC_ERROR_SUMMARY

  if (firstLine.length <= MAX_SUMMARY_CHARS) return firstLine
  return `${firstLine.slice(0, MAX_SUMMARY_CHARS)}…`
}
