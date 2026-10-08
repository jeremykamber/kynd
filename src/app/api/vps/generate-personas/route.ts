// VPS-backend endpoint: called by server actions, not the browser.
// Accepts a free-text persona description, starts background generation, and
// returns { runId } immediately; poll GET /api/vps/analyze-progress and
// /api/vps/persona-result with that runId. Rate-limited per client IP.

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { storeProgress, storeCompleted } from "@/actions/getProgress";


const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const personasRateLimiter = new RateLimiterMemory({
  keyPrefix: "personas",
  points: AUDIT_RATE_LIMIT_MAX,
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});


export async function POST(req: NextRequest) {
  const { personaDescription, count, mode } = await req.json();

  if (!personaDescription || typeof personaDescription !== "string" || personaDescription.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required field: personaDescription must be a non-empty string." },
      { status: 400 },
    );
  }

  const personaCount = typeof count === "number" && count >= 1 && count <= 20 ? count : 5;

  const generationMode = mode === "research" || mode === "strategy" ? mode : undefined;

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

  const runId = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  runGeneration(runId, personaDescription, personaCount, generationMode).catch((err) => {
    console.error(`[generate-personas] Background generation failed for ${runId}:`, err);
  });

  return NextResponse.json({ runId });
}

// Background generation runner

async function runGeneration(runId: string, personaDescription: string, count: number, generationMode?: 'research' | 'strategy') {
  try {
    storeProgress(runId, { step: "BRAINSTORMING_PERSONAS" });

    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const useCase = new GeneratePersonasUseCase(llmService);

    const personas = await useCase.execute(personaDescription, (progress) => {
      storeProgress(runId, {
        step: progress.step,
        streamingText: progress.streamingText,
        completedResponses: progress.completedCount ?? progress.completedSubSteps,
        totalResponses: progress.totalCount ?? progress.totalSubSteps,
      });
    }, count, undefined, generationMode);

    const serialized = JSON.parse(JSON.stringify(personas));
    personaGenerationStore.save(runId, serialized);
    storeCompleted(runId);
    console.log(`[generate-personas] Completed ${runId} with ${personas.length} personas`);
  } catch (error) {
    console.error("[generate-personas] Failed:", error);
    const errMsg = (error as Error).message;
    personaGenerationStore.saveError(runId, errMsg);
    storeCompleted(runId, errMsg);
  }
}
