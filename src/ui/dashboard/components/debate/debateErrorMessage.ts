/**
 * Maps a raw engine/debug error string from a debate room to a concise,
 * user-facing message. Engine strings (e.g. `TypeError: streamData is not
 * async iterable`) are never shown verbatim; callers may still surface the raw
 * value behind a technical-details affordance.
 */

const GENERIC_MESSAGE =
  "The debate could not be completed. This is usually a temporary problem — try again.";

export function getDebateErrorMessage(error?: string): string {
  const raw = error?.trim();
  if (!raw) {
    return "The debate ended unexpectedly before it produced a result. Try again.";
  }

  const normalized = raw.toLowerCase();

  if (
    normalized.includes("streamdata") ||
    normalized.includes("async iterable") ||
    normalized.includes("stream")
  ) {
    return "The debate service stopped responding before the debate finished. Try again.";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "The debate took too long and timed out before it finished. Try again.";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("429") ||
    normalized.includes("too many requests")
  ) {
    return "The debate service is busy right now. Wait a moment and try again.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("econnrefused") ||
    normalized.includes("unreachable")
  ) {
    return "We couldn't reach the debate service. Check your connection and try again.";
  }

  return GENERIC_MESSAGE;
}
