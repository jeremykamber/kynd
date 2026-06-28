// ─── POST /api/vps/validate-analysis ────────────────────────────────────────
// Validates a PricingAnalysis against a Persona's backstory using an LLM
// critic. Returns a CriticEvaluation with scores and reasoning.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { ValidateAnalysisUseCase } from "@/application/usecases/ValidateAnalysisUseCase";
import { OpenRouterCriticAdapter } from "@/infrastructure/adapters/OpenRouterCriticAdapter";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

export async function POST(req: NextRequest) {
  const { persona, analysis } = await req.json();

  try {
    const criticService = OpenRouterCriticAdapter.createFromEnv();
    const useCase = new ValidateAnalysisUseCase(criticService);
    const evaluation = await useCase.execute(
      persona as Persona,
      analysis as PricingAnalysis,
    );

    return NextResponse.json({ success: true, evaluation });
  } catch (error) {
    console.error("Error in validate-analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred during validation.",
      },
      { status: 500 },
    );
  }
}
