"use server";

import { RecordStepUseCase } from "@/application/usecases/RecordStepUseCase";
import { LlmMemoryAdapter } from "@/infrastructure/adapters/LlmMemoryAdapter";
import { TestingSession } from "@/domain/entities/TestingSession";
import { InteractionStep } from "@/domain/entities/InteractionStep";

import { shouldRunLocally } from "@/infrastructure/config";
import { vpsFetchRaw } from "./vpsClient";

async function runLocally(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  const memoryAdapter = LlmMemoryAdapter.createFromEnv();
  const useCase = new RecordStepUseCase(memoryAdapter);
  const updatedSession = await useCase.execute(session, step);
  return { success: true, session: updatedSession };
}

async function runRemote(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  const res = await vpsFetchRaw("record-step", { session, step });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { success: false, error: err.error || `HTTP ${res.status}` };
  }
  return res.json();
}

/**
 * Records one interaction step in a testing session. Local mode runs
 * RecordStepUseCase in-process; remote mode POSTs to the VPS. Never throws:
 * failures resolve `{ success: false, error }`.
 */
export async function recordStepAction(
  session: TestingSession,
  step: InteractionStep
): Promise<{ success: true; session: TestingSession } | { success: false; error: string }> {
  try {
    if (shouldRunLocally()) return runLocally(session, step);
    return runRemote(session, step);
  } catch (error) {
    console.error("Error in recordStepAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unknown error occurred while recording the step.",
    };
  }
}
