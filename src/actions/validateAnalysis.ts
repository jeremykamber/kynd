"use server";

import { ValidateAnalysisUseCase } from "@/application/usecases/ValidateAnalysisUseCase";
import { OpenRouterCriticAdapter } from "@/infrastructure/adapters/OpenRouterCriticAdapter";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { CriticEvaluation } from "@/domain/entities/CriticEvaluation";

import { shouldRunLocally, VPS_BACKEND_URL, getVpsAuthToken } from "@/infrastructure/config";

async function runLocally(
  persona: Persona,
  analysis: PricingAnalysis
): Promise<{ success: true; evaluation: CriticEvaluation } | { success: false; error: string }> {
  const criticService = OpenRouterCriticAdapter.createFromEnv();
  const useCase = new ValidateAnalysisUseCase(criticService);
  const evaluation = await useCase.execute(persona, analysis);
  return { success: true, evaluation };
}

async function runRemote(
  persona: Persona,
  analysis: PricingAnalysis
): Promise<{ success: true; evaluation: CriticEvaluation } | { success: false; error: string }> {
  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/validate-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getVpsAuthToken()}`,
    },
    body: JSON.stringify({ persona, analysis }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { success: false, error: err.error || `HTTP ${res.status}` };
  }
  return res.json();
}

/**
 * Server action to validate a PricingAnalysis against a Persona's backstory.
 * Uses local execution in development, VPS remote in production.
 */
export async function validateAnalysisAction(
  persona: Persona,
  analysis: PricingAnalysis
): Promise<{ success: true; evaluation: CriticEvaluation } | { success: false; error: string }> {
  try {
    if (shouldRunLocally()) return runLocally(persona, analysis);
    return runRemote(persona, analysis);
  } catch (error) {
    console.error("Error in validateAnalysisAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred during validation.",
    };
  }
}
