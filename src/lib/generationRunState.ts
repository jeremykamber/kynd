/**
 * Run ids already turned into a persona batch in `usePersonaStore`.
 *
 * A completed generation can be observed by both the streaming path and the
 * background poller in `PersonaProgressToaster`; the first to finish adds the
 * id here so the other skips the batch. In-memory, per tab, and never cleared
 * — a reload forgets which runs were consumed.
 */
export const batchConsumedRunIds = new Set<string>()
