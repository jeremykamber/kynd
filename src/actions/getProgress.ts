"use server";

/**
 * Progress side-channel for long-running runs. The RSC stream dies when a
 * client navigates away, so the pipeline writes progress here and pages poll
 * it after navigation. The store is in-memory and per server process: entries
 * do not survive a restart or reach another instance.
 *
 * Do not import types from other modules here — "use server" files are
 * rewritten by the bundler and such imports can break at runtime.
 */

import { shouldRunLocally } from "@/infrastructure/config";
import { progressMap } from "@/infrastructure/progressStore";
import { vpsGet } from "./vpsClient";

/** Progress fields reported for a run; absent fields are omitted. */
export interface ProgressState {
  step?: string;
  streamingText?: string;
  personaName?: string;
  completedResponses?: number;
  totalResponses?: number;
  completedCount?: number;
  totalCount?: number;
  error?: string;
  hasCompleted?: boolean;
  /** AI-generated simulation title (nice-to-have; applied to the name). */
  title?: string;
}

/**
 * Merges the defined fields of `state` into the run's stored progress;
 * undefined fields are ignored.
 */
export async function storeProgress(runId: string, state: ProgressState): Promise<void> {
  const existing = progressMap.get(runId) || {};
  const clean = Object.fromEntries(
    Object.entries(state).filter(([_, v]) => v !== undefined)
  );
  progressMap.set(runId, { ...existing, ...clean });
  console.log(`[PROGRESS_STORE] Saved for ${runId}: step=${state.step ?? existing.step ?? '?'}, completed=${state.completedResponses ?? existing.completedResponses ?? '?'}/${state.totalResponses ?? existing.totalResponses ?? '?'}, hasCompleted=${!!state.hasCompleted}, error=${state.error ?? 'none'}`);
}

/** Marks a run finished and records an optional error message. */
export async function storeCompleted(runId: string, errorMsg?: string): Promise<void> {
  console.log(`[PROGRESS_STORE] markCompleted for ${runId}`);
  await storeProgress(runId, { step: 'DONE', hasCompleted: true, error: errorMsg });
}

/**
 * Returns a run's stored progress: local mode reads the in-memory store,
 * remote mode GETs the VPS. Resolves `{ found: false }` when the run is
 * unknown or the VPS errors.
 */
export async function getProgressAction(runId: string): Promise<{
  found: boolean;
  progress?: ProgressState;
}> {
  if (shouldRunLocally()) {
    const p = progressMap.get(runId);
    if (!p) {
      console.log(`[PROGRESS_POLL] ${runId}: NOT FOUND (map size=${progressMap.size})`);
      return { found: false };
    }
    console.log(`[PROGRESS_POLL] ${runId}: FOUND step=${p.step ?? '?'}, completed=${p.completedResponses ?? '?'}/${p.totalResponses ?? '?'}, hasCompleted=${!!p.hasCompleted}, error=${p.error ?? 'none'}`);
    return { found: true, progress: p };
  }

  try {
    const data = await vpsGet<{ found: boolean; progress?: ProgressState }>(
      "analyze-progress",
      { runId },
    );
    return data;
  } catch {
    console.error(`[PROGRESS_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
