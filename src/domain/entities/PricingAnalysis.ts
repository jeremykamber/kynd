import { z } from "zod";
import type { PersonaProfile } from "./PersonaProfile";

export interface GazePoint {
    x: number; // 0-100 percentage
    y: number; // 0-100 percentage
    focusLabel: string;
}

export interface PricingAnalysis {
    id: string;
    url: string;
    screenshotBase64: string;
    thoughts: string;
    scores: {
        clarity: number;
        clarityReason: string;
        valuePerception: number;
        valuePerceptionReason: string;
        trust: number;
        trustReason: string;
        explorationIntent: number;
        explorationIntentReason: string;
        analysisIntent: number;
        analysisIntentReason: string;
        buyIntent: number;
        buyIntentReason: string;
    };
    risks: string[];
    recommendations: string[];
    aiSuggestion: string;  // Persona-specific actionable insight — LLM-generated, NOT boilerplate
    summary?: string[];  // 3-5 bullet points summarizing key findings
    gazePoints?: GazePoint[];
    gutReaction?: string;
    rawAnalysis?: string;
    personaProfile?: PersonaProfile;
    personaId?: string;
}

export const PricingAnalysisSchema = z.object({
    gutReaction: z.string().describe("Initial, visceral reaction to the page in one short sentence as the persona."),
    thoughts: z.string().describe("Structured evaluation using [The Good], [The Bad], and [The Dealbreaker] sections in first person as the persona."),
    scores: z.object({
        clarity: z.number().min(1).max(10).describe("How clear is the pricing?"),
        clarityReason: z.string().describe("1-2 sentences explaining the clarity score."),
        valuePerception: z.number().min(1).max(10).describe("Perceived value score."),
        valuePerceptionReason: z.string().describe("1-2 sentences explaining the value perception score."),
        trust: z.number().min(1).max(10).describe("Trust score."),
        trustReason: z.string().describe("1-2 sentences explaining the trust score."),
        explorationIntent: z.number().min(1).max(10).describe("Exploration intent score."),
        explorationIntentReason: z.string().describe("1-2 sentences explaining exploration intent."),
        analysisIntent: z.number().min(1).max(10).describe("Analysis intent score."),
        analysisIntentReason: z.string().describe("1-2 sentences explaining analysis intent."),
        buyIntent: z.number().min(1).max(10).describe("Purchase intent score."),
        buyIntentReason: z.string().describe("1-2 sentences explaining purchase intent."),
    }),
    risks: z.array(z.string()).describe("3 concrete risks stated in first person from the persona's perspective."),
    recommendations: z.array(z.string()).describe("2-3 imperative action items directed AT THE COMPANY starting with action verbs (e.g. 'Add', 'Offer', 'Reframe'). No advice to the user."),
    aiSuggestion: z.string().describe("ONE imperative sentence directed AT THE COMPANY stating the single most critical change to win this persona over. Starts with an action verb. No pronouns (no 'I', 'my', 'you', or persona names)."),
    summary: z.array(z.string()).optional().describe("3-5 concise bullet points summarizing key findings."),
});

export function validatePricingAnalysis(entity: PricingAnalysis): boolean {
    if (!entity || typeof entity !== "object") return false;

    if (!entity.id || typeof entity.id !== "string") return false;
    if (!entity.url || typeof entity.url !== "string") return false;
    if (entity.url !== "Screenshot Upload" && !entity.url.startsWith("uploaded://")) {
        try { new URL(entity.url); } catch (e) { return false; }
    }
    if (!entity.screenshotBase64 || typeof entity.screenshotBase64 !== "string") return false;
    if (!entity.thoughts || typeof entity.thoughts !== "string") return false;

    const scores = entity.scores as any;
    if (!scores || typeof scores !== "object") return false;

    const requiredScoreKeys = [
        "clarity", "clarityReason",
        "valuePerception", "valuePerceptionReason",
        "trust", "trustReason",
        "explorationIntent", "explorationIntentReason",
        "analysisIntent", "analysisIntentReason",
        "buyIntent", "buyIntentReason",
    ];

    for (const key of requiredScoreKeys) {
        const val = scores[key];
        if (typeof val === "number") {
            if (!Number.isFinite(val) || val < 1 || val > 10) return false;
        } else if (typeof val === "string") {
            if (val.trim().length === 0) return false;
        } else {
            return false;
        }
    }

    if (!Array.isArray(entity.risks)) return false;
    for (const r of entity.risks) { if (typeof r !== "string") return false; }

    if (!Array.isArray(entity.recommendations)) return false;
    for (const r of entity.recommendations) { if (typeof r !== "string") return false; }

    if (!entity.aiSuggestion || typeof entity.aiSuggestion !== "string" || entity.aiSuggestion.trim().length === 0) return false;

    if (entity.gazePoints !== undefined) {
        if (!Array.isArray(entity.gazePoints)) return false;
        for (const gp of entity.gazePoints) {
            if (typeof gp.x !== "number" || typeof gp.y !== "number" || typeof gp.focusLabel !== "string") return false;
        }
    }

    return true;
}
