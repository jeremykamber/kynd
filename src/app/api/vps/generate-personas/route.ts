// ─── POST /api/vps/generate-personas ────────────────────────────────────────
// Generates a set of AI personas from a free-text description (e.g. "target
// audience for a SaaS budgeting tool"). Returns the full array of Persona
// objects as JSON once generation is complete.
// Rate-limited per client IP.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

// ── Rate Limiter ────────────────────────────────────────────────────────────

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const personasRateLimiter = new RateLimiterMemory({
  keyPrefix: "personas",
  points: AUDIT_RATE_LIMIT_MAX,
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { personaDescription } = await req.json();

  // ── Rate limit ──────────────────────────────────────────────────────────
  const clientIP =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    await personasRateLimiter.consume(clientIP);
  } catch (rejRes: any) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${Math.round(rejRes.msBeforeNext / 1000)} seconds.`,
      },
      { status: 429 },
    );
  }

  // ── Execute ─────────────────────────────────────────────────────────────
  try {
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new GeneratePersonasUseCase(llmService);

    const personas = await useCase.execute(personaDescription);
    const serialized = JSON.parse(JSON.stringify(personas));

    return NextResponse.json({ step: "DONE", personas: serialized });
  } catch (error) {
    console.error("Error generating personas:", error);
    return NextResponse.json(
      { step: "ERROR", error: (error as Error).message },
      { status: 500 },
    );
  }
}
