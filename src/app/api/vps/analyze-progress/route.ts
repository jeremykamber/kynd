// VPS-backend endpoint: called by server actions, not the browser.
// Polls the progress of a running analysis or persona generation by ?runId=.
// Never call server actions here (they self-reference in VPS mode).

import { NextRequest, NextResponse } from "next/server";
import { progressMap } from "@/infrastructure/progressStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const progress = progressMap.get(runId);
  if (!progress) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({
    found: true,
    progress,
  });
}
