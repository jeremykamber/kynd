import type { CognitiveStage } from './CognitiveStage';

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
