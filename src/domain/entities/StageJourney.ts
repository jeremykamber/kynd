import { COGNITIVE_STAGES, type CognitiveStage } from './CognitiveStage';

/** How the persona felt while passing through a stage. */
export type StageSentiment = 'positive' | 'neutral' | 'negative';

/**
 * Whether the persona made it past this stage. `succeeded` means it moved on;
 * `blocked` means friction stopped progress; `stopped` means it chose to end
 * the journey.
 */
export type StageOutcome = 'succeeded' | 'blocked' | 'stopped';

/** What the persona experienced at one stage of its cognitive journey. */
export interface StageJourney {
  stage: CognitiveStage;
  description: string;
  sentiment: StageSentiment;
  outcome: StageOutcome;
  /** What moved the persona to the next stage, or why it stopped. */
  transition?: string;
}

/**
 * The five-stage view of a journey that may be stored sparse. A persona only
 * evaluates stages until it stops; the tail is projected as not reached so a
 * renderer never has to invent those stages or infer where the path ended.
 *
 * A complete journey is returned unchanged. A legacy five-stage journey with
 * later stopped stages is also returned unchanged; the renderer already treats
 * stages after the first stop as not reached.
 */
export function completeJourney(journey: StageJourney[]): StageJourney[] {
  if (journey.length >= COGNITIVE_STAGES.length) return journey;

  const terminalIndex = journey.findIndex(
    (stage) => stage.outcome === 'blocked' || stage.outcome === 'stopped',
  );
  const reached = terminalIndex === -1 ? journey.length : terminalIndex + 1;
  const reachedStages = journey.slice(0, reached);
  const abandonedAt = reachedStages[reachedStages.length - 1]?.stage;

  return COGNITIVE_STAGES.map(
    (stage, index): StageJourney =>
      reachedStages[index] ?? {
        stage,
        description: abandonedAt
          ? `Not reached. Abandoned at ${abandonedAt}.`
          : 'Not reached.',
        sentiment: 'neutral',
        outcome: 'stopped',
      },
  );
}
