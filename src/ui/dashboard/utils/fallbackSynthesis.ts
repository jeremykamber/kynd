import { responseCounts, type PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";

/**
 * Placeholder ArtifactSynthesis for an analysis that has no server-side
 * synthesis: fills the run's counts from the responses themselves (the same
 * predicate the report and the server use) and leaves every LLM-produced field
 * empty. Consumers render empty sections as hidden rather than as synthesized
 * output.
 */
export function fallbackSynthesis(responses: PersonaResponse[]): ArtifactSynthesis {
  const counts = responseCounts(responses);
  return {
    overview: "",
    researchQuestionAnswer: "",
    topFindings: [],
    disagreements: [],
    biggestFrictions: [],
    completedCount: counts.completed,
    failedCount: counts.failed,
    totalPersonaCount: counts.total,
  };
}
