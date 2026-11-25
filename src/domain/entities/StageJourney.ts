import type { CognitiveStage } from './CognitiveStage';
import type { StageAnchor } from './ArtifactProfile';

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
  /**
   * The artifact location this stage refers to. The profile chooses which
   * kind is allowed: timestamps for a video script, headings or verbatim
   * quotes for text, none for a site. An anchor never changes the stage order.
   */
  anchor?: StageAnchor;
}
