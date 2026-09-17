"use server";

import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

import { shouldRunLocally } from "@/infrastructure/config";

/**
 * Runs counterfactual probes against a persona, returning each attribute's
 * detail and reason. Local mode only: resolves an empty array when the app is
 * configured to run against the VPS.
 */
export async function applyCounterfactualTestAction(
    persona: Persona,
): Promise<{ detail: string; reason: string; attribute?: string }[]> {
    if (!shouldRunLocally()) {
        console.warn("[applyCounterfactualTestAction] Remote mode not supported yet");
        return [];
    }

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    return llmService.applyCounterfactualTest(persona);
}
