"use server";

import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { createStreamableValue } from "@ai-sdk/rsc";

/** Lifecycle step of a variation-generation run. */
export type SimilarPersonaProgressStep = "GENERATING" | "DONE" | "ERROR";

/** Payload streamed by generateSimilarPersonasAction. */
export interface SimilarPersonaProgress {
  step: SimilarPersonaProgressStep;
  personas?: Persona[];
  error?: string;
}

import { shouldRunLocally } from "@/infrastructure/config";
import { vpsFetchRaw } from "./vpsClient";

async function runLocally(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  const stream = createStreamableValue<SimilarPersonaProgress>({ step: "GENERATING" });

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const personas = await llmService.generateVariationPersonas(referencePersona, adjustments, count);
      stream.done({ step: "DONE", personas: JSON.parse(JSON.stringify(personas)) });
    } catch (error) {
      console.error("[generateSimilarPersonasAction] Failed:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

async function runRemote(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  const stream = createStreamableValue<SimilarPersonaProgress>({ step: "GENERATING" });

  (async () => {
    try {
      const res = await vpsFetchRaw("generate-similar-personas", { referencePersona, adjustments, count });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        stream.done({ step: "ERROR", error: err.error || `HTTP ${res.status}` });
        return;
      }

      const data = await res.json();
      stream.done({ step: "DONE", personas: data.personas || data });
    } catch (error) {
      console.error("[generateSimilarPersonasAction] Remote failed:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}

/**
 * Generates variation personas around a reference persona. Returns
 * `streamData`, a stream emitting GENERATING, then DONE with the new personas
 * or ERROR. Local mode calls the LLM in-process; remote mode POSTs to the VPS.
 */
export async function generateSimilarPersonasAction(
  referencePersona: Persona,
  adjustments: {
    bigFive: {
      conscientiousness: number;
      neuroticism: number;
      openness: number;
      extraversion: number;
      agreeableness: number;
    };
    variationLevel: number;
  },
  count: number,
) {
  if (shouldRunLocally()) return runLocally(referencePersona, adjustments, count);
  return runRemote(referencePersona, adjustments, count);
}
