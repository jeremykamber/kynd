// ─── POST /api/vps/generate-personas ────────────────────────────────────────
// Accepts a free-text persona description, kicks off background persona
// generation, and returns a runId immediately. The client polls
//   GET /api/vps/analyze-progress?runId=pt-<timestamp>
//   GET /api/vps/persona-result?runId=pt-<timestamp>
// to track progress and retrieve the final personas (or error).
// Rate-limited per client IP.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { storeProgress, storeCompleted } from "@/actions/getProgress";

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

  // ── Validate input ──────────────────────────────────────────────────────
  if (!personaDescription || typeof personaDescription !== "string" || personaDescription.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required field: personaDescription must be a non-empty string." },
      { status: 400 },
    );
  }

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

  // ── Generate runId and kick off background generation ───────────────────
  const runId = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  runGeneration(runId, personaDescription).catch((err) => {
    console.error(`[generate-personas] Background generation failed for ${runId}:`, err);
  });

  return NextResponse.json({ runId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Background generation runner
// ─────────────────────────────────────────────────────────────────────────────

async function runGeneration(runId: string, personaDescription: string) {
  try {
    storeProgress(runId, { step: "BRAINSTORMING_PERSONAS" });

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new GeneratePersonasUseCase(llmService);

    const personas = await useCase.execute(personaDescription, (progress) => {
      storeProgress(runId, {
        step: progress.step,
        completedAnalyses: progress.completedCount ?? progress.completedSubSteps ?? undefined,
        totalAnalyses: progress.totalCount ?? progress.totalSubSteps ?? undefined,
      });
    });

    const serialized = JSON.parse(JSON.stringify(personas));
    personaGenerationStore.save(runId, serialized);
    storeCompleted(runId);
    console.log(`[generate-personas] Completed ${runId} with ${personas.length} personas`);
  } catch (error) {
    console.error("[generate-personas] Failed:", error);
    const errMsg = (error as Error).message;
    personaGenerationStore.saveError(runId, errMsg);
    storeProgress(runId, { error: errMsg });
  }
}
