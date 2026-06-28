// ─── GET /api/vps/analyze-result ───────────────────────────────────────────
// Poll the final results (or error) of a completed pricing page analysis.
// The background analysis runner writes results to the SimulationResultStore;
// this endpoint reads from that store.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSimulationResultAction } from "@/actions/getSimulationResult";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = await getSimulationResultAction(runId);
  return NextResponse.json(result);
}
