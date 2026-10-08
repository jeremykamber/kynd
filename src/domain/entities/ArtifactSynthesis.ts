/**
 * Cross-persona synthesis of one completed artifact analysis: the cohort-level
 * answer to the research question plus the counts that make the findings
 * interpretable.
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
  citations?: EvidenceCitation[]
}

/** A verbatim quote resolved to the persona transcript it came from. */
export interface EvidenceCitation {
  /** Matches PersonaResponse.personaId */
  personaId: string
  /** Denormalized for display */
  personaName: string
  /** VERBATIM substring of that persona's rawAnalysis transcript */
  quote: string
}

/**
 * The LLM's pointer at supporting evidence: a short phrase copied from ONE
 * persona's transcript. Resolved into an EvidenceCitation by code
 * (application/synthesis/citations.ts — the only module that knows how);
 * never stored or rendered.
 */
export interface EvidenceLocator {
  personaId: string
  uniqueAnchorPhrase: string
}

/**
 * LLM-produced finding: anchor phrases instead of citations. Kept distinct
 * from SynthesizedFinding so the LLM wire shape can't be confused with
 * grounded, user-facing content.
 */
export type UnresolvedFinding = Omit<SynthesizedFinding, 'citations'> & {
  evidenceLocators?: EvidenceLocator[]
}

/**
 * What the LLM produces for one cohort-synthesis call. The completion counts
 * are excluded because they are caller-computed facts (the caller ran the
 * analysis and knows them) — the LLM must never fabricate them.
 */
export type CohortSynthesisContent = Omit<
  ArtifactSynthesis,
  'topFindings' | 'completedCount' | 'failedCount' | 'totalPersonaCount'
> & {
  topFindings: UnresolvedFinding[]
}

/** A topic where the cohort split into opposing views. */
export interface Disagreement {
  topic: string;
  /** Each view with how many personas held it. */
  split: { view: string; personaCount: number }[]
  significance: 'High' | 'Medium' | 'Low'
}
