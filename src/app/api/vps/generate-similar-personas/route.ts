// VPS-backend endpoint: called by server actions, not the browser.
// Generates N variations of a reference persona from Big-Five adjustments and
// a variation level, returning them synchronously as JSON (no runId polling).

import { NextRequest, NextResponse } from "next/server";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

export async function POST(req: NextRequest) {
  const { referencePersona, adjustments, count } = await req.json();

  try {
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const personas = await llmService.generateVariationPersonas(
      referencePersona,
      adjustments,
      count,
    );

    const serialized = JSON.parse(JSON.stringify(personas));
    return NextResponse.json({ step: "DONE", personas: serialized });
  } catch (error) {
    console.error("[generate-similar-personas] Failed:", error);
    return NextResponse.json(
      { step: "ERROR", error: (error as Error).message },
      { status: 500 },
    );
  }
}
