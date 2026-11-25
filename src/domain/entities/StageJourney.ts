import type { CognitiveStage } from './CognitiveStage';
import { isAnchorAllowed, timestampSeconds, type ArtifactProfile, type StageAnchor } from './ArtifactProfile';

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

/**
 * Drops an anchor the profile does not allow. A timestamp must be valid and
 * rise across the stages; a heading or quote must appear verbatim in the text.
 * An anchor never changes the stage order, so a dropped anchor leaves the rest
 * of the stage untouched.
 */
export function sanitizeJourneyAnchors(
  journey: StageJourney[],
  profile: ArtifactProfile,
  text?: string,
): StageJourney[] {
  const haystack = text === undefined
    ? null
    : text.replace(/\s+/g, ' ').trim().toLowerCase();
  let previousSeconds = -1;

  return journey.map((stage) => {
    const anchor = stage.anchor;
    if (!anchor || !isAnchorAllowed(anchor, profile)) {
      return anchor ? { ...stage, anchor: undefined } : stage;
    }
    if (anchor.kind === 'timestamp') {
      const seconds = timestampSeconds(anchor.value);
      if (!Number.isFinite(seconds) || seconds <= previousSeconds) {
        return { ...stage, anchor: undefined };
      }
      previousSeconds = seconds;
      return stage;
    }
    if (haystack !== null && !haystack.includes(anchor.value.replace(/\s+/g, ' ').trim().toLowerCase())) {
      return { ...stage, anchor: undefined };
    }
    return stage;
  });
}
