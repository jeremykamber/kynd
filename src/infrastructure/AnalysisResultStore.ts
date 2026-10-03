import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { ExpiringStore } from './ExpiringStore'

interface StoredAnalysis {
  analyses: PersonaResponse[]
  completedAt: string
  error?: string
  synthesis?: ArtifactSynthesis
}

/**
 * Server-side in-memory store for completed artifact-analysis results.
 * Analyses run in a fire-and-forget IIFE inside the server action; when the
 * client disconnects (reload/navigate away), the IIFE keeps running with no
 * reader on the streaming response. This store captures the final results (or
 * the failure) so `getAnalysisResult`/the VPS result routes can serve them to
 * the reconnecting client.
 *
 * Results live for 30 minutes after the last save, then are dropped. Writes
 * come from the analysis run; reads come from `src/actions/getAnalysisResult.ts`
 * and `src/app/api/vps/analyze-result/route.ts`.
 */
class AnalysisResultStore {
  private readonly store = new ExpiringStore<StoredAnalysis>(
    '__kynd_analysis_results',
    '__kynd_analysis_cleanups',
  );

  save(runId: string, analyses: PersonaResponse[], synthesis?: ArtifactSynthesis): void {
    console.log(`[RESULT_STORE] Saving ${analyses.length} analyses for ${runId}`);
    this.store.set(runId, {
      analyses,
      completedAt: new Date().toISOString(),
      synthesis,
    })
  }

  saveError(runId: string, error: string): void {
    console.log(`[RESULT_STORE] Saving error for ${runId}: ${error}`);
    this.store.set(runId, {
      analyses: [],
      completedAt: new Date().toISOString(),
      error,
    })
  }

  get(runId: string): StoredAnalysis | undefined {
    return this.store.get(runId)
  }

  remove(runId: string): void {
    this.store.delete(runId)
  }
}

export const analysisResultStore = new AnalysisResultStore()
