import { z } from "zod";
import type { PersonaProfile } from "./PersonaProfile";
import type { StageJourney } from "./StageJourney";
import type { MajorFinding } from "./MajorFinding";
import type { CognitiveStage } from "./CognitiveStage";
import { COGNITIVE_STAGES } from "./CognitiveStage";

/**
 * How a persona's pipeline ended. `failed` responses carry no report at all:
 * the run stopped before there was anything to report, so the UI shows the
 * failure instead of a fabricated journey.
 */
export type ResponseOutcome = "completed" | "failed";

/**
 * One persona's response to an artifact — the core output of the analysis.
 * Contains the persona's full reasoning trace and structured report.
 * Embeds a PersonaProfile (lightweight display projection) rather than the
 * full Persona entity to avoid carrying backstory, provenance, and other
 * 30+ fields into every saved result.
 */
export interface PersonaResponse {
  id: string;
  artifactUrl?: string;
  screenshotBase64: string;
  /**
   * The engine's own log for this persona: the think-aloud transcript on a
   * completed run, the raw failure text on a failed one. Never shown as
   * report prose — see `failureMessage` for what the user reads.
   */
  rawAnalysis: string;
  overview: string;
  /**
   * Exactly one entry per stage, in `COGNITIVE_STAGES` order; validation
   * rejects a journey that is shorter, longer, out of order, or repeats a
   * stage.
   */
  customerJourney: StageJourney[];
  researchQuestionAnswer: string;
  majorFindings: MajorFinding[];
  pointsOfFriction: string[];
  unansweredQuestions: string[];
  /** Display projection of the persona; absent for persisted older results. */
  personaProfile?: PersonaProfile;
  /** Id of the Persona this response came from. */
  personaId?: string;
  /**
   * How this persona's pipeline ended: `"completed"` or `"failed"`. Set by the
   * use case, never by the model.
   *
   * Absent on responses persisted before this marker existed, and those split
   * into two shapes the marker alone cannot tell apart: a genuine report from
   * the pipeline of that time, and the failure placeholder it wrote on a
   * per-persona catch — an apology in place of an overview, five "Not reached"
   * stages, the error text in `pointsOfFriction`, no marker. Browser storage
   * outlives deploys, so those older responses are still read today and
   * `isCompletedResponse` decides them by shape (see `LEGACY_FAILURE_OVERVIEW`)
   * rather than assuming absence means success.
   */
  outcome?: ResponseOutcome;
  /**
   * User-facing reason this persona's analysis failed (`outcome === "failed"`).
   * The engine's raw text stays in `rawAnalysis`.
   */
  failureMessage?: string;
}

/**
 * The `overview` the pre-marker pipeline wrote when one persona's analysis
 * failed. That path returned a whole report shape for a run that produced
 * nothing: this apology as the overview, five "Not reached — analysis failed."
 * stages, the error text in `pointsOfFriction`, and no `outcome` field. A
 * marker-less response carrying this overview is that failure, and the only
 * thing still telling it apart from a real report of the same era.
 */
const LEGACY_FAILURE_OVERVIEW = "Analysis could not be completed.";

/**
 * Whether a response carries a report. The single predicate for the fact —
 * the progress denominator, the synthesis input, the report and the PDF all
 * read failure from here instead of re-deriving it from prose or shape.
 */
export function isCompletedResponse(response: PersonaResponse): boolean {
  if (response.outcome === "failed") return false;
  if (response.outcome === "completed") return true;
  return response.overview !== LEGACY_FAILURE_OVERVIEW;
}

/** The responses that carry a report, in their original order. */
export function completedResponses(responses: PersonaResponse[]): PersonaResponse[] {
  return responses.filter(isCompletedResponse);
}

/** Completed / failed / attempted counts for a run's responses. */
export function responseCounts(responses: PersonaResponse[]): {
  completed: number;
  failed: number;
  total: number;
} {
  const completed = completedResponses(responses).length;
  return { completed, failed: responses.length - completed, total: responses.length };
}

// C0/C1 control characters (tab, newline and carriage return excepted) are
// never part of a sentence: a raw U+0000 from the model reaches the screen as
// a tofu box. Matched here once, for the schemas below.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Strips control characters from model-produced free text. */
export function cleanLlmText(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/**
 * A free-text field, sanitised as it is parsed. The schemas below are the one
 * boundary every LLM-produced string crosses, so cleaning here keeps every
 * consumer (report, PDF, chat, exports) free of control characters instead of
 * each render site stripping them again.
 */
const textField = (description: string) => z.string().describe(description).transform(cleanLlmText);

const StageJourneySchema = z.object({
  stage: z.enum(["interpretation", "understanding", "belief", "motivation", "action"]),
  description: textField("What the persona experienced at this stage."),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the persona felt during this stage."),
  outcome: z.enum(["succeeded", "blocked", "stopped"]).describe("Whether the persona successfully passed this stage."),
  transition: textField("What caused progression to the next stage, or why they stopped.").optional(),
});

const MajorFindingSchema = z.object({
  observation: textField("What happened — a specific behavior or reaction observed."),
  evidence: textField("What the persona experienced that supports this observation. Grounded in the analysis."),
  impact: textField("Why this matters — the downstream effect on the persona's experience."),
});

export const PersonaResponseSchema = z.object({
  overview: textField("High-level summary of this persona's response to the artifact, covering their full journey and key takeaways."),
  customerJourney: z.array(StageJourneySchema).describe("The persona's experience across all five cognitive stages in order."),
  researchQuestionAnswer: textField("Direct answer to the research question, grounded in evidence from this persona's analysis."),
  majorFindings: z.array(MajorFindingSchema).describe("Key findings from this persona's response. Each finding has an observation, evidence, impact, and confidence level."),
  pointsOfFriction: z.array(textField("Moments where the persona failed to progress through the cognitive journey — what confused, frustrated, or stopped them.")),
  unansweredQuestions: z.array(textField("Questions the persona still had after interacting with the artifact. These often reveal missing information.")),
});

/**
 * Checks a value has every required PersonaResponse field and a journey that
 * covers all five cognitive stages once, in order. Optional fields and the
 * artifact/persona identity fields are not cross-checked.
 */
export function validatePersonaResponse(response: PersonaResponse): boolean {
  if (!response || typeof response !== "object") return false;

  if (!response.id || typeof response.id !== "string") return false;
  if (!response.screenshotBase64 || typeof response.screenshotBase64 !== "string") return false;
  if (!response.rawAnalysis || typeof response.rawAnalysis !== "string") return false;
  if (!response.overview || typeof response.overview !== "string") return false;
  if (typeof response.researchQuestionAnswer !== "string") return false;

  if (!Array.isArray(response.customerJourney) || response.customerJourney.length !== COGNITIVE_STAGES.length) return false;
  if (!Array.isArray(response.majorFindings)) return false;
  if (!Array.isArray(response.pointsOfFriction)) return false;
  if (!Array.isArray(response.unansweredQuestions)) return false;

  // Enforce stage ordering: each stage must appear exactly once, in the correct order
  for (let i = 0; i < COGNITIVE_STAGES.length; i++) {
    const stage = response.customerJourney[i];
    if (!stage || stage.stage !== COGNITIVE_STAGES[i]) return false;
    if (!stage.description || !stage.sentiment || !stage.outcome) return false;
  }

  for (const finding of response.majorFindings) {
    if (!finding.observation || !finding.evidence || !finding.impact) return false;
  }

  return true;
}
