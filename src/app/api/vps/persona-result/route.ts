// VPS-backend endpoint: called by server actions, not the browser.
// Polls the final personas or error of a completed persona generation
// identified by ?runId=.

import { NextRequest, NextResponse } from "next/server";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json(
      { error: "Missing required query parameter: runId" },
      { status: 400 },
    );
  }

  const result = personaGenerationStore.get(runId);
  if (!result) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    personas: result.personas,
    error: result.error,
    completedAt: result.completedAt,
  });
}
