import { z } from "zod";
import type { PersonaProfile } from "./PersonaProfile";
import type { StageJourney } from "./StageJourney";
import type { MajorFinding } from "./MajorFinding";
import type { CognitiveStage } from "./CognitiveStage";
import type { PersonaClaim } from "./PersonaClaim";
import type { SimulationFrame } from "./SimulationFrame";
import type { Verdict } from "./Verdict";
import { COGNITIVE_STAGES } from "./CognitiveStage";

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
  /** Absent for text runs — there is no screenshot to embed. */
  screenshotBase64?: string;
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
   * Claims extracted from the monologue by the separate claim pass. Absent
   * when that pass failed; an absent set is a recorded degradation, not an
   * empty cohort finding.
   */
  claims?: PersonaClaim[];
  /** The persona's final decision from the fixed verdict set. */
  verdict?: Verdict;
  /** One sentence naming why the persona decided as it did. */
  decisiveReason?: string;
  /** Verbatim sentence from `rawAnalysis` supporting `decisiveReason`. */
  decisiveReasonQuote?: string;
  /** The role, task, and decision question this persona ran under. */
  decisionFrame?: SimulationFrame;
}

const StageAnchorSchema = z.object({
  kind: z.enum(["timestamp", "heading", "quote"]).describe("What the anchor points at."),
  value: z.string().describe("A timestamp, heading, or phrase copied from the artifact."),
});

const StageJourneySchema = z.object({
  stage: z.enum(["interpretation", "understanding", "belief", "motivation", "action"]),
  description: z.string().describe("What the persona experienced at this stage."),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the persona felt during this stage."),
  outcome: z.enum(["succeeded", "blocked", "stopped"]).describe("Whether the persona successfully passed this stage."),
  transition: z.string().optional().describe("What caused progression to the next stage, or why they stopped."),
  anchor: StageAnchorSchema.optional().describe("Where in the artifact this stage refers to."),
});

const MajorFindingSchema = z.object({
  observation: z.string().describe("What happened — a specific behavior or reaction observed."),
  evidence: z.string().describe("What the persona experienced that supports this observation. Grounded in the analysis."),
  impact: z.string().describe("Why this matters — the downstream effect on the persona's experience."),
});

export const PersonaResponseSchema = z.object({
  overview: z.string().describe("High-level summary of this persona's response to the artifact, covering their full journey and key takeaways."),
  customerJourney: z.array(StageJourneySchema).describe("The persona's experience across all five cognitive stages in order."),
  researchQuestionAnswer: z.string().describe("Direct answer to the research question, grounded in evidence from this persona's analysis."),
  majorFindings: z.array(MajorFindingSchema).describe("Key findings from this persona's response. Each finding has an observation, evidence, impact, and confidence level."),
  pointsOfFriction: z.array(z.string()).describe("Moments where the persona failed to progress through the cognitive journey — what confused, frustrated, or stopped them."),
  unansweredQuestions: z.array(z.string()).describe("Questions the persona still had after interacting with the artifact. These often reveal missing information."),
  // Raw model value; code normalizes anything outside the fixed set to
  // `undecided`, so one bad token cannot fail the whole extraction.
  verdict: z.string().optional().describe("One of adopt, trial, reject, undecided."),
  decisiveReason: z.string().optional().describe("One sentence naming why the persona decided as it did."),
  decisiveReasonQuote: z.string().optional().describe("A complete sentence copied verbatim from the transcript."),
});

/**
 * Identity drift the report cannot recover from: the summary layers must say
 * whose session they describe. Observed in real runs: "The user reviewed
 * feature-brief.docx…" in 2 of 8 responses (no name to attribute the finding
 * to), and summaries that spoke as the persona.
 *
 * Mechanical on purpose — three rules, no judgement:
 * 1. the persona's name appears in the overview and the RQ answer;
 * 2. the summary never calls them "the user" (that loses the attribution);
 * 3. the summary never slips into the first person.
 *
 * Role/pronoun transfer from the artifact's own copy is prompted against, not
 * detected here: deciding that "freelancer" contradicts "Head of Marketing"
 * needs the artifact and the persona model, which this function does not see.
 */
/** Everything inside quotation marks is quoted speech, not the writer's voice. */
export function withoutQuotedSpans(text: string): string {
  return text
    .replace(/"[^"]*"/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/‘[^’]*’/g, " ")
    .replace(/'[^']*'/g, " ");
}

export function personaIdentityViolations(
  response: PersonaResponse,
  fallbackName?: string,
): string[] {
  const name = response.personaProfile?.name ?? fallbackName ?? "";
  const fields = [
    { field: "overview", text: response.overview ?? "" },
    { field: "researchQuestionAnswer", text: response.researchQuestionAnswer ?? "" },
  ];
  const violations: string[] = [];

  // Each summary field must name the persona on its own. Checking the joined
  // text let a name in one field cover an anonymous sentence in the other.
  for (const { field, text } of fields) {
    // A verbatim quote of the artifact ("show me one") is evidence, not voice.
    const plain = withoutQuotedSpans(text);
    if (name && !plain.toLowerCase().includes(name.toLowerCase())) {
      violations.push(`${field} does not name the persona (${name})`);
    }
    if (/\bthe user\b/i.test(plain)) {
      violations.push(`${field} refers to "the user" instead of the persona`);
    }
    if (/\b(I|I'm|I've|my|me)\b/i.test(plain)) {
      violations.push(`${field} speaks in the first person`);
    }
  }
  return violations;
}

/**
 * Checks a value has every required PersonaResponse field and a journey that
 * covers all five cognitive stages once, in order. Optional fields and the
 * artifact/persona identity fields are not cross-checked.
 */
export function validatePersonaResponse(response: PersonaResponse): boolean {
  if (!response || typeof response !== "object") return false;

  if (!response.id || typeof response.id !== "string") return false;
  if (response.screenshotBase64 !== undefined && typeof response.screenshotBase64 !== "string") return false;
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
    if (stage.anchor && !["timestamp", "heading", "quote"].includes(stage.anchor.kind)) return false;
    if (stage.anchor && typeof stage.anchor.value !== "string") return false;
  }

  for (const finding of response.majorFindings) {
    if (!finding.observation || !finding.evidence || !finding.impact) return false;
  }

  return true;
}
