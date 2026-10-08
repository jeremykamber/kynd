/**
 * Run ids already turned into a persona batch in `usePersonaStore`.
 *
 * A completed generation can be observed by both the streaming path and the
 * background poller in `PersonaProgressToaster`; the first to finish adds the
 * id here so the other skips the batch. Failed runs are recorded the same way,
 * since a failure now leaves a batch behind too. In-memory, per tab, and never
 * cleared — a reload forgets which runs were consumed, which is safe because
 * the run id is removed from `activeGenerationRunIds` as it settles.
 */
export const batchConsumedRunIds = new Set<string>()
