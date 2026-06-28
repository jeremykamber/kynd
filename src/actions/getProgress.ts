"use server";

// Server-side progress store for pricing analysis simulations.
// The RSC stream (readStreamableValue) uses an in-memory promise chain that
// dies when the user navigates away from the dashboard. Without a persistent
// store, the simulation stays IN_PROGRESS forever because the DONE event is
// never consumed by the disconnected client.
//
// This store acts as a side-channel: progress callbacks in the analysis
// pipeline write here, and the simulation detail page polls for updates
// after navigation. Combined with the SimulationResultStore (which captures
// the final analyses), this ensures progress visibility survives navigation.

export interface ProgressState {
  step?: string;
  completedAnalyses?: number;
  totalAnalyses?: number;
  error?: string;
  hasCompleted?: boolean;
}

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;
const RUN_LOCALLY = process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";

// Store on globalThis to survive Next.js HMR (dev mode), which resets module-level
// variables when files change. The running IIFE writes to the original Map, and
// polling reads from it — if they become different objects, progress is lost.
const KEY = '__kynd_progress_map';
const progressMap: Map<string, ProgressState> =
  (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = new Map());

export async function storeProgress(runId: string, state: ProgressState): Promise<void> {
  const existing = progressMap.get(runId) || {};
  progressMap.set(runId, { ...existing, ...state });
  console.log(`[PROGRESS_STORE] Saved for ${runId}: step=${state.step ?? existing.step ?? '?'}, completed=${state.completedAnalyses ?? existing.completedAnalyses ?? '?'}/${state.totalAnalyses ?? existing.totalAnalyses ?? '?'}, hasCompleted=${!!state.hasCompleted}, error=${state.error ?? 'none'}`);
}

export async function storeCompleted(runId: string): Promise<void> {
  console.log(`[PROGRESS_STORE] markCompleted for ${runId}`);
  await storeProgress(runId, { hasCompleted: true });
}

export async function getProgressAction(runId: string): Promise<{
  found: boolean;
  progress?: ProgressState;
}> {
  if (RUN_LOCALLY) {
    const p = progressMap.get(runId);
    if (!p) {
      console.log(`[PROGRESS_POLL] ${runId}: NOT FOUND (map size=${progressMap.size})`);
      return { found: false };
    }
    console.log(`[PROGRESS_POLL] ${runId}: FOUND step=${p.step ?? '?'}, completed=${p.completedAnalyses ?? '?'}/${p.totalAnalyses ?? '?'}, hasCompleted=${!!p.hasCompleted}, error=${p.error ?? 'none'}`);
    return { found: true, progress: p };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-progress?runId=${runId}`, {
    headers: { Authorization: `Bearer ${VPS_AUTH_TOKEN}` },
  });
  return res.json();
}
