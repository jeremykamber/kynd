// ─── GET /api/vps/analyze-result ───────────────────────────────────────────
// Poll the final results (or error) of a completed pricing page analysis.
// The background analysis runner writes results to the SimulationResultStore;
// this endpoint reads from that store.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { simulationResultStore } from "@/infrastructure/SimulationResultStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = simulationResultStore.get(runId);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  console.log(`[analyze-result] FOUND result for ${runId}: analyses=${result.analyses.length}, error=${result.error ?? 'none'}`);

  return NextResponse.json({
    found: true,
    analyses: result.analyses,
    error: result.error,
    completedAt: result.completedAt,
  });
}
