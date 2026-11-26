import type { ContentKind, ArtifactFact } from './ArtifactProfile';
import type { ClaimGroup, ClaimLedger } from './PersonaClaim';

/**
 * Cross-persona synthesis of one completed artifact analysis: the cohort-level
 * answer to the research question plus the counts that make the findings
 * interpretable.
 *
 * Every count and citation here is filled by code from the claim ledger. The
 * writer contributes wording only. Optional fields keep older persisted
 * records parseable and renderable.
 */
export interface ArtifactSynthesis {
  overview: string;
  researchQuestionAnswer: string;
  topFindings: SynthesizedFinding[];
  disagreements: Disagreement[];
  biggestFrictions: string[];
  /** Personas that produced a response and contributed to this synthesis. */
  completedCount: number;
  /** Personas whose analysis failed; excluded from the synthesis. */
  failedCount: number;
  /** Size of the cohort the analysis targeted. */
  totalPersonaCount: number;
  /** Verdict counts copied from the persona responses; missing verdicts are `undecided`. */
  verdicts?: Record<'adopt' | 'trial' | 'reject' | 'undecided', number>;
  /** The supported ledger groups, for inspection. Unsupported claims never enter. */
  claimGroups?: ClaimGroup[];
  /**
   * Claims the support gate or the verbatim check rejected, kept so the persona
   * card can show a collapsed "Not counted" section. They never set a count,
   * finding, or split.
   */
  rejectedClaims?: ClaimLedger['rejectedClaims'];
  /** Facts the artifact profile extracted. Empty when the profile is missing. */
  facts?: ArtifactFact[];
  contentKind?: ContentKind;
  /** Pipeline degradations visible to the reader (missing profile, fallback clustering). */
  degraded?: string[];
  /** Personas whose claim pass produced no claims; each counts as one QA mark. */
  missingClaimPersonaIds?: string[];
  /**
   * Fields the validator rejected after the repair attempt, as
   * `<field>: <message>` strings. The same fields are marked inline and
   * stamped on every PDF page.
   */
  validationWarnings?: string[];
}

/** A synthesis finding that has been grounded against persona transcripts. */
export interface SynthesizedFinding {
  observation: string;
  evidence: string;
  impact: string;
  confidence: 'strongly supported' | 'some support' | 'weakly supported';
  /** How many personas this finding is drawn from. */
  affectedPersonaCount: number;
  /** Cohort size the count is out of. */
  totalPersonaCount: number;
  /**
   * Verbatim quotes from persona transcripts backing this finding. Absent
   * when no locator resolved — never padded with placeholder text.
   */
  citations?: EvidenceCitation[];
  /** Ledger group this finding was built from; used to mark a failed field. */
  groupId?: string;
}

/** A verbatim quote resolved to the persona transcript it came from. */
export interface EvidenceCitation {
  /** Matches PersonaResponse.personaId */
  personaId: string;
  /** Denormalized for display */
  personaName: string;
  /** VERBATIM substring of that persona's rawAnalysis transcript */
  quote: string;
  decisionRole?: string;
  occupation?: string;
}

/** A topic where the cohort split into opposing views. */
export interface Disagreement {
  topic: string;
  /**
   * Each view with how many personas held it. Always sums to
   * `completedCount`: the remainder is reported as `No clear view`.
   */
  split: { view: string; personaCount: number }[];
  significance: 'High' | 'Medium' | 'Low';
  /** Ledger group this split was built from; used to mark a failed field. */
  groupId?: string;
}
