import { z } from "zod";
import type { PersonaProfile } from "./PersonaProfile";
import type { StageJourney } from "./StageJourney";
import type { MajorFinding } from "./MajorFinding";
import type { CognitiveStage } from "./CognitiveStage";
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
}

const StageJourneySchema = z.object({
  stage: z.enum(["interpretation", "understanding", "belief", "motivation", "action"]),
  description: z.string().describe("What the persona experienced at this stage."),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("How the persona felt during this stage."),
  outcome: z.enum(["succeeded", "blocked", "stopped"]).describe("Whether the persona successfully passed this stage."),
  transition: z.string().optional().describe("What caused progression to the next stage, or why they stopped."),
});

const MajorFindingSchema = z.object({
  observation: z.string().describe("What happened — a specific behavior or reaction observed."),
  evidence: z.string().describe("What the persona experienced that supports this observation. Grounded in the analysis."),
  impact: z.string().describe("Why this matters — the downstream effect on the persona's experience."),
});

export const PersonaResponseSchema = z.object({
  overview: z.string().describe("High-level summary of this persona's response to the artifact, covering their full journey and key takeaways."),
  customerJourney: z.array(StageJourneySchema).min(1).max(COGNITIVE_STAGES.length).describe("The stages the persona reached, in canonical order, ending at the stage where it stopped or was blocked. A persona that completed all five stages returns all five."),
  researchQuestionAnswer: z.string().describe("Direct answer to the research question, grounded in evidence from this persona's analysis."),
  majorFindings: z.array(MajorFindingSchema).describe("Key findings from this persona's response. Each finding has an observation, evidence, impact, and confidence level."),
  pointsOfFriction: z.array(z.string()).describe("Moments where the persona failed to progress through the cognitive journey — what confused, frustrated, or stopped them."),
  unansweredQuestions: z.array(z.string()).describe("Questions the persona still had after interacting with the artifact. These often reveal missing information."),
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
  const summary = [response.overview ?? "", response.researchQuestionAnswer ?? ""];
  // A verbatim quote of the artifact ("show me one") is evidence, not voice.
  const joined = withoutQuotedSpans(summary.join(" "));
  const violations: string[] = [];

  if (name && !joined.toLowerCase().includes(name.toLowerCase())) {
    violations.push(`does not name the persona (${name})`);
  }
  if (/\bthe user\b/i.test(joined)) {
    violations.push('refers to "the user" instead of the persona');
  }
  if (/\b(I|I'm|I've|my|me)\b/i.test(joined)) {
    violations.push("speaks in the first person");
  }
  return violations;
}

/**
 * The journey must agree with itself: a succeeded stage cannot describe
 * stopping, and once a stage is blocked or stopped every later stage is
 * stopped. Observed drift: a persona "stopped at the price" in motivation and
 * then "succeeded" at action, so the report claimed both.
 *
 * The phrase list is deliberately narrow. Negative sentiment is allowed on a
 * succeeded stage (a persona can dislike the page and still understand it), and
 * incidental words like "blocked" inside a success story are not flagged.
 */
const JOURNEY_STOP_PHRASE =
  /\b(stopped (?:at|here|short)|gave up|abandoned|could not continue|couldn't continue|did not continue|didn't continue|failed to proceed|never reached)\b/i;

export function journeyContradictions(response: PersonaResponse): string[] {
  const violations: string[] = [];
  let journeyEnded = false;

  for (const stage of response.customerJourney) {
    const prose = `${stage.description} ${stage.transition ?? ""}`;

    if (stage.outcome === "succeeded" && JOURNEY_STOP_PHRASE.test(prose)) {
      violations.push(`stage "${stage.stage}" says it succeeded but describes stopping`);
    }

    if (journeyEnded && stage.outcome !== "stopped") {
      violations.push(`stage "${stage.stage}" follows an ended journey but is "${stage.outcome}"`);
    }

    if (stage.outcome === "blocked" || stage.outcome === "stopped") {
      journeyEnded = true;
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

  const journey = response.customerJourney;
  if (!Array.isArray(journey) || journey.length < 1 || journey.length > COGNITIVE_STAGES.length) return false;
  if (!Array.isArray(response.majorFindings)) return false;
  if (!Array.isArray(response.pointsOfFriction)) return false;
  if (!Array.isArray(response.unansweredQuestions)) return false;

  // Enforce stage ordering: the journey is a prefix of the canonical order.
  for (let i = 0; i < journey.length; i++) {
    const stage = journey[i];
    if (!stage || stage.stage !== COGNITIVE_STAGES[i]) return false;
    if (!stage.description || !stage.sentiment || !stage.outcome) return false;
  }

  // A sparse journey ends at the stop. A full five-stage journey may still
  // carry later stopped stages from older persisted analyses; completeJourney
  // projects those for rendering, and new writes truncate them.
  if (journey.length < COGNITIVE_STAGES.length) {
    const terminal = journey.findIndex((stage) => stage.outcome === "blocked" || stage.outcome === "stopped");
    if (terminal !== journey.length - 1) return false;
  }

  for (const finding of response.majorFindings) {
    if (!finding.observation || !finding.evidence || !finding.impact) return false;
  }

  return true;
}
