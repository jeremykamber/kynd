"use server";

import type { Persona } from "@/domain/entities/Persona";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import { shouldRunLocally } from "@/infrastructure/config";
import { vpsGet } from "./vpsClient";

/** Outcome of getPersonaGenerationResultAction; `personas` is set only when found. */
export interface PersonaGenerationResult {
  found: boolean;
  personas?: Persona[];
  error?: string;
  completedAt?: string;
}

/**
 * Returns a completed persona generation: local mode reads the in-memory
 * store, remote mode GETs the VPS. Resolves `{ found: false }` when unknown,
 * still running, or on a VPS error.
 */
export async function getPersonaGenerationResultAction(runId: string): Promise<PersonaGenerationResult> {
  if (shouldRunLocally()) {
    const result = personaGenerationStore.get(runId);
    if (!result) {
      console.log(`[PERSONA_RESULT_POLL] ${runId}: NOT FOUND`);
      return { found: false };
    }
    console.log(`[PERSONA_RESULT_POLL] ${runId}: FOUND personas=${result.personas.length}, error=${result.error ?? "none"}, completedAt=${result.completedAt}`);
    return {
      found: true,
      personas: result.personas,
      error: result.error,
      completedAt: result.completedAt,
    };
  }

  try {
    return await vpsGet("persona-result", { runId });
  } catch {
    console.error(`[PERSONA_RESULT_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
