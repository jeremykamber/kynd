// ─── POST /api/vps/generate-personas-from-interviews ────────────────────────
// Accepts interview transcript files (multipart/form-data), extracts key
// behavioral traits, and generates a set of AI personas based on the real
// interview content. Returns the full array of Persona objects as JSON once
// processing is complete.
// Rate-limited per client IP.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { GeneratePersonasFromInterviewsUseCase } from "@/application/usecases/GeneratePersonasFromInterviewsUseCase";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { IdRagStore } from "@/infrastructure/adapters/IdRagStore";

// ── Rate Limiter ────────────────────────────────────────────────────────────

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || "5");
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.AUDIT_RATE_LIMIT_WINDOW_MS || "60000",
);

const pipelineRateLimiter = new RateLimiterMemory({
  keyPrefix: "pipeline",
  points: AUDIT_RATE_LIMIT_MAX,
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Rate limit ──────────────────────────────────────────────────────────
  const clientIP =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    await pipelineRateLimiter.consume(clientIP);
  } catch (rejRes: any) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${Math.round(rejRes.msBeforeNext / 1000)} seconds.`,
      },
      { status: 429 },
    );
  }

  // ── Parse multipart form data ───────────────────────────────────────────
  const formData = await req.formData();
  const files: { filename: string; content: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (
      value instanceof File &&
      (key === "files" || key.startsWith("file_"))
    ) {
      const content = await value.text();
      files.push({ filename: value.name, content });
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      {
        error:
          "No transcript files provided. Please upload at least one interview transcript.",
      },
      { status: 400 },
    );
  }

  // ── Execute ─────────────────────────────────────────────────────────────
  try {
    const llmService = LlmServiceImpl.createFromEnv("openrouter");
    const idRagStore = new IdRagStore();
    const generatePersonasUseCase = new GeneratePersonasUseCase(llmService);
    const useCase = new GeneratePersonasFromInterviewsUseCase(
      llmService,
      idRagStore,
      generatePersonasUseCase,
    );

    const personas = await useCase.execute(files);
    const serialized = JSON.parse(JSON.stringify(personas));

    return NextResponse.json({ step: "DONE", personas: serialized });
  } catch (error) {
    console.error("Error generating personas from interviews:", error);
    return NextResponse.json(
      { step: "ERROR", error: (error as Error).message },
      { status: 500 },
    );
  }
}
