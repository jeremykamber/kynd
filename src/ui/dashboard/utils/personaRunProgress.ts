/**
 * One home for "how far along is this persona run", shared by the generating
 * page and the app-wide toast so the two surfaces can never disagree.
 *
 * The interview pipeline reports counts whose denominator changes between
 * steps — transcripts while extracting, personas while generating — so a raw
 * `completed / total` bar rewinds the moment the denominator changes (50% at
 * sampling, then 0% at the first generating tick). Each step therefore owns a
 * fixed band of the bar, and a step's own counts fill only its own band. The
 * bar only ever advances, and the personas-generated count drives the longest
 * phase, which is what the reader watches.
 */

/** Interview-pipeline steps, as the [start, end] share of the whole run. */
const INTERVIEW_STEP_BANDS: Record<string, readonly [number, number]> = {
  // Both spellings: the short form is what the interview pipeline emits, the
  // long form is what pre-rename runs may still carry in the progress store.
  EXTRACTING: [0.1, 0.3],
  EXTRACTING_SIGNALS: [0.1, 0.3],
  POOLING: [0.3, 0.4],
  POOLING_SIGNALS: [0.3, 0.4],
  SAMPLING: [0.4, 0.5],
  SAMPLING_PERSONAS: [0.4, 0.5],
  GENERATING: [0.5, 0.92],
  GENERATING_PERSONAS: [0.5, 0.92],
  INGESTING: [0.92, 1],
  INGESTING_TO_MEMORY: [0.92, 1],
}

/**
 * Steps of the description-driven persona pipeline as a 0-1 ratio. These steps
 * report no usable counts, so a step's position in the flow is its whole
 * contribution.
 */
const STEP_PROGRESS: Record<string, number> = {
  BRAINSTORMING_PERSONAS: 0.1,
  GENERATING_BACKSTORIES: 0.2,
  // Alias: entries written before this step was renamed may still carry the
  // old key, so both spellings stay mapped.
  ENHANCING_WITH_PBJ: 0.5,
  ADDING_BEHAVIORAL_DEPTH: 0.5,
  GENERATING_INSIGHTS: 0.75,
  DONE: 1,
}

/**
 * The run's completion as a 0-1 ratio. `completed`/`total` are whatever the
 * step reports; they are ignored for steps that do not carry a meaningful
 * count, and ignored entirely when absent.
 */
export function personaRunProgress(
  step?: string,
  completed?: number,
  total?: number,
): number {
  const band = step ? INTERVIEW_STEP_BANDS[step] : undefined
  if (band) {
    const share =
      typeof completed === 'number' && typeof total === 'number' && total > 0
        ? Math.min(completed / total, 1)
        : 0
    return band[0] + (band[1] - band[0]) * share
  }
  return STEP_PROGRESS[step ?? ''] ?? 0
}
