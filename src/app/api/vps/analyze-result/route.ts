// VPS-backend endpoint: called by server actions, not the browser.
// Polls the final analyses, synthesis, or error of a completed analysis run
// identified by ?runId=.

import { NextRequest, NextResponse } from "next/server";
import { analysisResultStore } from "@/infrastructure/AnalysisResultStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = analysisResultStore.get(runId);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    analyses: result.analyses,
    error: result.error,
    completedAt: result.completedAt,
    synthesis: result.synthesis ?? null,
  });
}
