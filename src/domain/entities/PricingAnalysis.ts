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
    gutReaction: z.string().describe("Your initial, visceral reaction to the page in one short sentence. Be blunt and use your personality."),
    thoughts: z.string().describe("A structured evaluation using [The Good], [The Bad], and [The Dealbreaker] sections. Speak in first person as the persona. Be specific and grounded in what you see on the page."),
    scores: z.object({
        clarity: z.number().min(1).max(10).describe("How clear is the pricing?"),
        clarityReason: z.string().describe("1-2 sentences explaining why you gave this clarity score."),
        valuePerception: z.number().min(1).max(10).describe("How is the perceived value?"),
        valuePerceptionReason: z.string().describe("1-2 sentences explaining why you gave this value score."),
        trust: z.number().min(1).max(10).describe("How much do you trust this page?"),
        trustReason: z.string().describe("1-2 sentences explaining why you gave this trust score."),
        explorationIntent: z.number().min(1).max(10).describe("Would you explore this further? Click around? Read more? 1=No interest, 10=Already trying to find the signup button."),
        explorationIntentReason: z.string().describe("1-2 sentences explaining your exploration intent."),
        analysisIntent: z.number().min(1).max(10).describe("Would you do a deep analysis? Compare with alternatives? Run a trial? 1=Not worth my time, 10=I'm already planning the pilot."),
        analysisIntentReason: z.string().describe("1-2 sentences explaining your analysis intent."),
        buyIntent: z.number().min(1).max(10).describe("How likely are you to actually purchase? 1=Never, 10=Ready to buy now."),
        buyIntentReason: z.string().describe("1-2 sentences explaining your purchase intent."),
    }),
    risks: z.array(z.string()).describe("3 specific risks or concerns, stated from your (the persona's) perspective. Ground each in something concrete you saw on the page."),
    recommendations: z.array(z.string()).describe("2-3 imperative sentences directed AT THE COMPANY telling them what to change. NOT self-advice. WRONG: 'Check if the Pro plan has a free trial.' WRONG: 'Look for a job search tool.' CORRECT: 'Offer a free trial on the Pro plan.' CORRECT: 'Add a job search section.'"),
    aiSuggestion: z.string().describe("ONE insight in YOUR (the persona's) first-person voice: what should THE COMPANY change to win YOU over? Reference something specific on the page. WRONG: 'Emerson, you should look for another tool.' WRONG: 'You should check for free trials.' CORRECT: 'I'd sign up tomorrow if you added a free trial to the Pro plan.' CORRECT: 'The one thing that would win me over is showing a student discount.'"),
    summary: z.array(z.string()).optional().describe("3-5 concise bullet points summarizing the key findings. Each bullet should be one sentence."),
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
