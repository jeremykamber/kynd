import type { ArtifactProfile } from './ArtifactProfile';
import type { ClaimGroup, ClaimLedger } from './PersonaClaim';

/**
 * The code-built input to the report writer. It holds the verified ledger and
 * its counts; it deliberately holds no raw transcript. The writer returns
 * language keyed by group id, and code joins that language to the ledger.
 */
export interface SynthesisPlan {
  researchQuestion: string;
  /** Absent until the artifact profile slice lands. */
  profile?: ArtifactProfile;
  ledger: ClaimLedger;
  /** Groups at the cohort-size finding floor. */
  findings: ClaimGroup[];
  /** Groups with support and opposition. */
  splits: ClaimGroup[];
  /** Groups with at least two opposing personas. */
  frictions: ClaimGroup[];
  completedCount: number;
  failedCount: number;
  totalPersonaCount: number;
  /** Persona names, so the validator can reject a name in aggregate prose. */
  personaNames?: string[];
}

/** What the writer returns. Every field is language; no field is a fact. */
export interface SynthesisDraft {
  overview: string;
  researchQuestionAnswer: string;
  findings: Array<{
    groupId: string;
    observation: string;
    impact: string;
  }>;
  disagreements: Array<{
    groupId: string;
    supportsLabel: string;
    opposesLabel: string;
  }>;
  frictions: Array<{
    groupId: string;
    text: string;
  }>;
}
