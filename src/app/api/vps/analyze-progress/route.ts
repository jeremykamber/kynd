// ─── GET /api/vps/analyze-progress ──────────────────────────────────────────
// Poll the progress state of a running pricing page analysis.
// The analysis writes progress updates to an in-memory side-channel store;
// this endpoint reads from that store so the UI can track the analysis
// even if the initial POST response has already been consumed.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getProgressAction } from "@/actions/getProgress";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = await getProgressAction(runId);
  return NextResponse.json(result);
}
