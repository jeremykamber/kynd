"use server";

import { simulationResultStore } from "@/infrastructure/SimulationResultStore";

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;
const RUN_LOCALLY = process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";

export async function getSimulationResultAction(runId: string): Promise<{
  found: boolean;
  analyses?: import('@/domain/entities/PricingAnalysis').PricingAnalysis[];
  error?: string;
  completedAt?: string;
}> {
  if (RUN_LOCALLY) {
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

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-result?runId=${runId}`, {
    headers: { Authorization: `Bearer ${VPS_AUTH_TOKEN}` },
  });
  return res.json();
}
