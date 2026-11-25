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

export const FACT_KINDS: FactKind[] = [
  'product',
  'audience',
  'offer',
  'price',
  'tier',
  'claim',
  'cta',
  'proof',
];

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

/** The anchor a profile may carry when the model does not choose one. */
export function defaultAnchorKind(kind: ContentKind): ArtifactProfile['stageAnchorKind'] {
  if (kind === 'video_script') return 'timestamp';
  if (kind === 'landing_page') return 'none';
  return 'quote';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseFact(value: unknown): ArtifactFact | PriceFact | null {
  const raw = record(value);
  if (!raw) return null;
  const kind = typeof raw.kind === 'string' && (FACT_KINDS as string[]).includes(raw.kind)
    ? (raw.kind as FactKind)
    : null;
  const label = text(raw.label);
  const factValue = text(raw.value);
  const source = raw.source === 'text' || raw.source === 'screenshot' ? raw.source : null;
  if (!kind || !label || !factValue || !source) return null;

  const base: ArtifactFact = {
    kind,
    label,
    value: factValue,
    source,
    ...(text(raw.sourceQuote) ? { sourceQuote: text(raw.sourceQuote) as string } : {}),
  };

  if (kind !== 'price') return base;
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
  const currency = text(raw.currency);
  if (!Number.isFinite(amount) || !currency) return null;
  const period = raw.period === 'month' || raw.period === 'year' || raw.period === 'one_time'
    ? raw.period
    : undefined;
  return { ...base, kind: 'price', amount, currency, ...(period ? { period } : {}) } as PriceFact;
}

/**
 * Validates the profile call's JSON. Anything that cannot be trusted is dropped
 * and recorded in `degraded`; the profile still exists so the run can continue.
 */
export function parseArtifactProfile(raw: unknown): ArtifactProfile {
  const source = record(raw);
  if (!source) throw new Error('Artifact profile is not an object');

  const degraded: string[] = [];
  const rawKind = text(source.contentKind);
  const contentKind = rawKind && (CONTENT_KINDS as string[]).includes(rawKind)
    ? (rawKind as ContentKind)
    : 'other';
  if (rawKind !== contentKind) degraded.push(`Unknown content kind "${rawKind}"; treated as other.`);

  const facts: ArtifactFact[] = [];
  const rawFacts = Array.isArray(source.facts) ? source.facts : [];
  for (const item of rawFacts) {
    const fact = parseFact(item);
    if (fact) facts.push(fact);
    else degraded.push('Dropped a fact that did not match the fact schema.');
  }

  const openQuestions = (Array.isArray(source.openQuestions) ? source.openQuestions : [])
    .map(text)
    .filter((q): q is string => q !== null);

  const rawAnchor = text(source.stageAnchorKind);
  const stageAnchorKind = rawAnchor === 'timestamp' || rawAnchor === 'heading' || rawAnchor === 'quote' || rawAnchor === 'none'
    ? rawAnchor
    : defaultAnchorKind(contentKind);
  if (rawAnchor && rawAnchor !== stageAnchorKind) {
    degraded.push(`Unknown anchor kind "${rawAnchor}"; used ${stageAnchorKind}.`);
  }

  const rawConfidence = text(source.confidence);
  const confidence = rawConfidence === 'high' || rawConfidence === 'medium' || rawConfidence === 'low'
    ? rawConfidence
    : 'low';

  return {
    contentKind,
    facts,
    openQuestions,
    stageAnchorKind,
    confidence,
    degraded: [...degraded, ...(Array.isArray(source.degraded) ? source.degraded.filter((d): d is string => typeof d === 'string') : [])],
  };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Numbers a reader would see. Used to catch a value that contradicts its quote. */
function numbersIn(value: string): Set<number> {
  const found = new Set<number>();
  for (const match of value.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const number = Number(match.replace(/,/g, ''));
    if (Number.isFinite(number)) found.add(number);
  }
  return found;
}

/**
 * The fact guard. A text fact survives only when its source quote is a verbatim
 * substring of the artifact text; a screenshot fact survives only when the run
 * carries a screenshot. Everything else is removed and the loss is recorded.
 */
export function guardProfileFacts(
  profile: ArtifactProfile,
  artifact: { text?: string; hasScreenshot: boolean },
): ArtifactProfile {
  const haystack = artifact.text === undefined ? null : normalize(artifact.text);
  const kept: ArtifactFact[] = [];
  const removed: string[] = [];

  for (const fact of profile.facts) {
    if (fact.source === 'screenshot') {
      if (artifact.hasScreenshot) kept.push(fact);
      else removed.push(`Screenshot fact "${fact.label}" removed: the run has no screenshot.`);
      continue;
    }
    if (haystack === null) {
      removed.push(`Text fact "${fact.label}" removed: the run has no text.`);
      continue;
    }
    if (!fact.sourceQuote || !haystack.includes(normalize(fact.sourceQuote))) {
      removed.push(`Fact "${fact.label}" removed: its quote is not in the artifact.`);
      continue;
    }
    // The quote can be real while the rendered value is not: "$99" beside a
    // "$49" quote must not reach the panel or the allowed-number set.
    const quoteNumbers = numbersIn(fact.sourceQuote);
    const valueNumbers = numbersIn(fact.value);
    if ([...valueNumbers].some((number) => !quoteNumbers.has(number))) {
      removed.push(`Fact "${fact.label}" removed: its value states a number the quote does not.`);
      continue;
    }
    kept.push(fact);
  }

  return {
    ...profile,
    facts: kept,
    degraded: [...profile.degraded, ...removed],
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
