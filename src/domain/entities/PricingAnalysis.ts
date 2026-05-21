import { z } from "zod";

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
    gazePoints?: GazePoint[];
    gutReaction?: string;
    rawAnalysis?: string;
}

export const PricingAnalysisSchema = z.object({
    gutReaction: z.string().describe("Your initial, visceral reaction to the page in one short sentence. Be blunt and use your personality."),
    thoughts: z.string().describe("A deep-dive evaluation of the pricing strategy in exactly 2 paragraphs. Speak in first person as the persona."),
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
    risks: z.array(z.string()).describe("A list of 3 specific things that bothered you or felt like risks."),
    recommendations: z.array(z.string()).describe("2-3 specific, actionable recommendations for what the company should change or test."),
    aiSuggestion: z.string().describe("A single, persona-specific actionable insight. What is THE ONE THING this company should change based on YOUR unique perspective? Be specific — reference what you saw on the page. This is NOT boilerplate."),
});


export function validatePricingAnalysis(entity: PricingAnalysis): boolean {
    if (!entity || typeof entity !== "object") return false;

    if (!entity.id || typeof entity.id !== "string") return false;
    if (!entity.url || typeof entity.url !== "string") return false;
    if (entity.url !== "Manual Upload" && !entity.url.startsWith("uploaded://")) {
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
