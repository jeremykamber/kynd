/**
 * What the artifact itself states, read once before persona analysis.
 *
 * The profile exists so the pipeline never invents a fact the artifact does
 * not state, and so the decision question is chosen from the artifact's kind
 * before any persona starts reading. `openQuestions` is the honest home for a
 * fact the artifact leaves out; nothing in this record may be filled from
 * general knowledge.
 */

export type ContentKind =
  | 'landing_page'
  | 'feature_brief'
  | 'pitch_deck'
  | 'marketing_copy'
  | 'video_script'
  | 'document'
  | 'other';

export type FactKind =
  | 'product'
  | 'audience'
  | 'offer'
  | 'price'
  | 'tier'
  | 'claim'
  | 'cta'
  | 'proof';

export interface ArtifactFact {
  kind: FactKind;
  label: string;
  value: string;
  /** Verbatim from text, or visible text from the screenshot. */
  sourceQuote?: string;
  /** Code can check text quotes; screenshot quotes are model-only. */
  source: 'text' | 'screenshot';
}

export interface PriceFact extends ArtifactFact {
  kind: 'price';
  amount: number;
  currency: string;
  period?: 'month' | 'year' | 'one_time';
}

export type StageAnchor =
  | { kind: 'timestamp'; value: string } // 0:42 or 01:02:03
  | { kind: 'heading'; value: string } // verbatim heading
  | { kind: 'quote'; value: string }; // verbatim phrase

export interface ArtifactProfile {
  contentKind: ContentKind;
  facts: ArtifactFact[];
  /** Facts the artifact does not state. The report must not guess them. */
  openQuestions: string[];
  stageAnchorKind: 'timestamp' | 'heading' | 'quote' | 'none';
  confidence: 'high' | 'medium' | 'low';
  /** Non-empty when extraction failed and the run uses a fallback. */
  degraded: string[];
}

/** The one question a persona answers for an artifact of this kind. */
export const CONTENT_KIND_QUESTION: Record<ContentKind, string> = {
  landing_page: 'Would you take the next step this page asks for?',
  feature_brief: 'Would you adopt this product in your work?',
  pitch_deck: 'Would you invest, partner, or buy after this deck?',
  marketing_copy: 'Would you act on this copy?',
  video_script: 'Would you keep watching and act on it?',
  document: 'Would you use this document to make a decision?',
  other: 'Would you act on this artifact?',
};

export const CONTENT_KINDS: ContentKind[] = [
  'landing_page',
  'feature_brief',
  'pitch_deck',
  'marketing_copy',
  'video_script',
  'document',
  'other',
];

/**
 * The documented fallback when the profile call fails. A degraded report is
 * better than a missing run, but the degradation stays visible: `degraded` is
 * non-empty and the report marks the facts unverified.
 */
export function fallbackArtifactProfile(kind: 'site' | 'document'): ArtifactProfile {
  return {
    contentKind: kind === 'document' ? 'document' : 'landing_page',
    facts: [],
    openQuestions: [],
    stageAnchorKind: kind === 'document' ? 'quote' : 'none',
    confidence: 'low',
    degraded: ['The artifact profile could not be extracted; facts are unverified.'],
  };
}

/** Mechanical timestamp check for a video stage anchor. */
export function isValidTimestamp(value: string): boolean {
  return /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(value.trim());
}

/** Converts `m:ss` or `h:mm:ss` to seconds; NaN when the value is not a timestamp. */
export function timestampSeconds(value: string): number {
  if (!isValidTimestamp(value)) return Number.NaN;
  const parts = value.trim().split(':').map(Number);
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

/** Whether a stage anchor is allowed for the profile's anchor kind. */
export function isAnchorAllowed(anchor: StageAnchor, profile: ArtifactProfile): boolean {
  if (profile.stageAnchorKind === 'none') return false;
  if (profile.stageAnchorKind === 'timestamp') {
    return anchor.kind === 'timestamp' && isValidTimestamp(anchor.value);
  }
  return anchor.kind === profile.stageAnchorKind;
}
