"use server";

import { simulationResultStore } from "@/infrastructure/SimulationResultStore";

export async function getSimulationResultAction(runId: string): Promise<{
  found: boolean;
  analyses?: import('@/domain/entities/PricingAnalysis').PricingAnalysis[];
  error?: string;
  completedAt?: string;
}> {
  const result = simulationResultStore.get(runId);
  if (!result) {
    console.log(`[RESULT_POLL] ${runId}: NOT FOUND`);
    return { found: false };
  }
  console.log(`[RESULT_POLL] ${runId}: FOUND analyses=${result.analyses.length}, error=${result.error ?? 'none'}, completedAt=${result.completedAt}`);
  return {
    found: true,
    analyses: result.analyses,
    error: result.error,
    completedAt: result.completedAt,
  };
}
