/**
 * A quality-control verdict on one persona's analysis: how coherent it was,
 * whether it hallucinated, and what to fix. Produced by an evaluator pass
 * over an analysis response.
 */
export interface CriticEvaluation {
  id: string;
  analysisId: string;
  personaId: string;
  /** 1-10; 1 is incoherent, 10 is fully coherent. */
  coherenceScore: number;
  isHallucinating: boolean;
  critique: string;
  suggestedFix?: string;
}

/**
 * Checks required identifiers are non-empty, the score is within 1-10, and
 * `suggestedFix` is a string when present.
 */
export function validateCriticEvaluation(entity: CriticEvaluation): boolean {
  if (!entity || typeof entity !== 'object') return false;

  if (typeof entity.id !== 'string' || !entity.id) return false;
  if (typeof entity.analysisId !== 'string' || !entity.analysisId) return false;
  if (typeof entity.personaId !== 'string' || !entity.personaId) return false;

  if (typeof entity.coherenceScore !== 'number' || entity.coherenceScore < 1 || entity.coherenceScore > 10) {
    return false;
  }

  if (typeof entity.isHallucinating !== 'boolean') return false;
  if (typeof entity.critique !== 'string' || !entity.critique) return false;

  if (entity.suggestedFix !== undefined && typeof entity.suggestedFix !== 'string') {
    return false;
  }

  return true;
}
