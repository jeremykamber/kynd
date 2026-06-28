// ─── GET /api/vps/analyze-screenshot ────────────────────────────────────────
// Poll the latest screenshot from a running pricing page analysis.
// Screenshots are large base64 strings delivered via a side-channel store
// rather than the initial response body.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getScreenshotAction } from "@/actions/getScreenshot";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = await getScreenshotAction(runId);
  return NextResponse.json(result);
}
