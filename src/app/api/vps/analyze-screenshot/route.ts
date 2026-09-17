// VPS-backend endpoint: called by server actions, not the browser.
// Polls the latest screenshot of a running analysis as base64. Screenshots are
// large, so they travel through this side channel, not the analyze response.

import { NextRequest, NextResponse } from "next/server";
import { screenshotStore } from "@/infrastructure/screenshotStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const screenshot = screenshotStore.get(runId);
  if (!screenshot) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, base64: screenshot });
}
