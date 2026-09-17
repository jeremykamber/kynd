import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";

/**
 * Placeholder ArtifactSynthesis for an analysis that has no server-side
 * synthesis: fills the counts from `responses.length` (completed and total,
 * zero failed) and leaves every LLM-produced field empty. Consumers render
 * empty sections as hidden rather than as synthesized output.
 */
export function fallbackSynthesis(responses: PersonaResponse[]): ArtifactSynthesis {
  return {
    overview: "",
    researchQuestionAnswer: "",
    topFindings: [],
    disagreements: [],
    biggestFrictions: [],
    completedCount: responses.length,
    failedCount: 0,
    totalPersonaCount: responses.length,
  };
}
