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

const progressMap = new Map<string, ProgressState>();

export async function storeProgress(runId: string, state: ProgressState): Promise<void> {
  const existing = progressMap.get(runId) || {};
  progressMap.set(runId, { ...existing, ...state });
}

export async function storeCompleted(runId: string): Promise<void> {
  await storeProgress(runId, { hasCompleted: true });
}

export async function getProgressAction(runId: string): Promise<{
  found: boolean;
  progress?: ProgressState;
}> {
  const p = progressMap.get(runId);
  if (!p) return { found: false };
  return { found: true, progress: p };
}
