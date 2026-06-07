"use server";

import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { createStreamableValue } from "@ai-sdk/rsc";

export type SimilarPersonaProgressStep = "GENERATING" | "DONE" | "ERROR";

export interface SimilarPersonaProgress {
  step: SimilarPersonaProgressStep;
  personas?: Persona[];
  error?: string;
}

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
  console.log("generateSimilarPersonasAction called...");
  const stream = createStreamableValue<SimilarPersonaProgress>({
    step: "GENERATING",
  });
  console.log("[generateSimilarPersonasAction] StreamableValue created, starting generation for count:", count, "reference:", referencePersona.name);

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");

      const personas = await llmService.generateVariationPersonas(
        referencePersona,
        adjustments,
        count,
      );

      const finalPersonas = JSON.parse(JSON.stringify(personas));
      console.log("[generateSimilarPersonasAction] Successfully generated", personas.length, "variations");
      stream.done({ step: "DONE", personas: finalPersonas });
    } catch (error) {
      console.error("[generateSimilarPersonasAction] Failed:", error);
      stream.done({
        step: "ERROR",
        error: (error as Error).message,
      });
    }
  })();

  return { streamData: stream.value };
}
