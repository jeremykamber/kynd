/**
 * One recorded action a persona took while interacting with an artifact,
 * forming the raw material for its memory summary.
 */
export interface InteractionStep {
  url: string;
  action: string;
  elementDescription: string;
  thought: string;
  /** Epoch milliseconds when the step was recorded. */
  timestamp: number;
}
