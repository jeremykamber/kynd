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
    return { found: false };
  }
  return {
    found: true,
    analyses: result.analyses,
    error: result.error,
    completedAt: result.completedAt,
  };
}
