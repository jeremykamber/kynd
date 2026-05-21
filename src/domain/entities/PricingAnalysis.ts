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
        clarity: number; // 1 - 10
        valuePerception: number; // 1 - 10
        trust: number; // 1 - 10
        likelihoodToBuy: number; // 1 - 10
    };
    risks: string[];
    recommendations: string[]; // Actionable copy, pricing, or UX suggestions
    gazePoints?: GazePoint[];
    gutReaction?: string;
    rawAnalysis?: string;
}

export const PricingAnalysisSchema = z.object({
    gutReaction: z.string().describe("Your initial, visceral reaction to the page in one short sentence. Be blunt and use your personality."),
    thoughts: z.string().describe("A deep-dive evaluation of the pricing strategy in exactly 2 paragraphs. Speak in first person as the persona."),
    scores: z.object({
        clarity: z.number().min(1).max(10).describe("How clear is the pricing?"),
        valuePerception: z.number().min(1).max(10).describe("How is the perceived value?"),
        trust: z.number().min(1).max(10).describe("How much do you trust this page?"),
        likelihoodToBuy: z.number().min(1).max(10).describe("How likely are you to buy?"),
    }),
    risks: z.array(z.string()).describe("A list of 3 specific things that bothered you or felt like risks."),
    recommendations: z.array(z.string()).describe("2-3 specific, actionable recommendations for what the company should change or test."),
});


export function validatePricingAnalysis(entity: PricingAnalysis): boolean {
    if (!entity || typeof entity !== "object") return false;

    // id
    if (!entity.id || typeof entity.id !== "string") return false;

    // url - must be a non-empty valid URL or "Manual Upload"
    if (!entity.url || typeof entity.url !== "string") return false;
    if (entity.url !== "Manual Upload" && !entity.url.startsWith("uploaded://")) {
        try {
            // eslint-disable-next-line no-new
            new URL(entity.url);
        } catch (e) {
            return false;
        }
    }

    // screenshotBase64 - must be a non-empty string (basic check)
    if (!entity.screenshotBase64 || typeof entity.screenshotBase64 !== "string")
        return false;

    // thoughts - non-empty string
    if (!entity.thoughts || typeof entity.thoughts !== "string") return false;

    // scores - must contain required numeric keys in range 1..10
    const scores = entity.scores as any;
    if (!scores || typeof scores !== "object") return false;

    const requiredScoreKeys = [
        "clarity",
        "valuePerception",
        "trust",
        "likelihoodToBuy",
    ];

    for (const key of requiredScoreKeys) {
        const val = scores[key];
        if (typeof val !== "number" || !Number.isFinite(val)) return false;
        if (val < 1 || val > 10) return false;
    }

    // risks - must be an array of strings (can be empty)
    if (!Array.isArray(entity.risks)) return false;
    for (const r of entity.risks) {
        if (typeof r !== "string") return false;
    }

    // recommendations - must be an array of strings
    if (!Array.isArray(entity.recommendations)) return false;
    for (const r of entity.recommendations) {
        if (typeof r !== "string") return false;
    }

    // gazePoints - optional array of GazePoint objects
    if (entity.gazePoints !== undefined) {
        if (!Array.isArray(entity.gazePoints)) return false;
        for (const gp of entity.gazePoints) {
            if (typeof gp.x !== "number" || typeof gp.y !== "number" || typeof gp.focusLabel !== "string") {
                return false;
            }
        }
    }

    return true;
}
