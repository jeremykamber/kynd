import type { CognitiveStage } from './CognitiveStage';

/**
 * One assertion a persona makes, with one verbatim quotation from its
 * monologue. A claim is not a finding: it belongs to one persona. Only claims
 * that pass the support gate enter a group, and a group only becomes a finding
 * when enough distinct personas hold it.
 */

export type ClaimStance = 'supports' | 'opposes' | 'neutral';

/** What the claim pass returns; ids are assigned by code, never by a model. */
export interface ExtractedClaim {
  topic: string;
  observation: string;
  stance: ClaimStance;
  quote: string;
  stage?: CognitiveStage;
}

export interface PersonaClaim extends ExtractedClaim {
  id: string;
  personaId: string;
}

export type SupportLevel = 'support' | 'partial' | 'unsupported';

export interface ClaimSupport {
  claimId: string;
  level: SupportLevel;
  reason: string;
}

export interface ClaimGroup {
  id: string;
  topic: string;
  claims: PersonaClaim[];
  /** Distinct personas in the group, never a claim count. */
  personaCount: number;
  supports: number;
  opposes: number;
  neutral: number;
  stage?: CognitiveStage;
  citations: ClaimCitation[];
}

export interface ClaimCitation {
  personaId: string;
  personaName: string;
  quote: string;
}

export interface ClaimLedger {
  groups: ClaimGroup[];
  verdicts: Record<'adopt' | 'trial' | 'reject' | 'undecided', number>;
  completedCount: number;
  failedCount: number;
  totalPersonaCount: number;
  /** Personas whose claim pass produced no claims at all. */
  missingClaimPersonaIds: string[];
  /** Claims dropped before or at the support gate, kept for inspection. */
  rejectedClaims: Array<{
    claim: PersonaClaim;
    level: SupportLevel;
    reason: string;
  }>;
  degraded: string[];
}

export const CLAIM_STANCES: ClaimStance[] = ['supports', 'opposes', 'neutral'];
export const SUPPORT_LEVELS: SupportLevel[] = ['support', 'partial', 'unsupported'];
