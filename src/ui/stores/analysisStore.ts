/**
 * Durable record of artifact analyses shown on the dashboard.
 *
 * Persisted under the IndexedDB key `analysis-storage` at `version: 3`;
 * state written by any older version is discarded by `migrate` rather than
 * upgraded, and the list starts empty. Only metadata is persisted —
 * `partialize` drops `streamingTexts`, each analysis's `screenshot`, and the
 * base64 screenshots inside `responses`, since those are large or short-lived
 * and are re-fetched from the server-side store on demand. `responses` and
 * `synthesis` are persisted.
 *
 * Status transitions are owned by the analysis flow: `markComplete`,
 * `markError` and `markCancelled` set a terminal status and `completedAt`,
 * while `updateAnalysis` carries in-flight progress. Every mutation is a no-op
 * for an unknown id, and a terminal status is terminal: what a record settled
 * as is what every surface keeps reading, with the one exception in
 * `mayOverwrite`.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { ArtifactAnalysis, AnalysisStatus } from '@/domain/entities/ArtifactAnalysis'
import { completedResponses, type PersonaResponse } from '@/domain/entities/PersonaResponse'
import { humanizeAnalysisError } from '@/lib/analysisError'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { indexedDBStorage } from '@/infrastructure/services/indexedDBStorage'

interface AnalysisPersistedState {
  analyses: ArtifactAnalysis[]
  dismissedAnalysisIds: string[]
}

interface AnalysisStoreState extends AnalysisPersistedState {
  analyses: ArtifactAnalysis[]
  dismissedAnalysisIds: string[]
  addAnalysis: (analysis: ArtifactAnalysis) => void
  updateAnalysis: (id: string, updates: Partial<ArtifactAnalysis>) => void
  removeAnalysis: (id: string) => void
  getAnalysis: (id: string) => ArtifactAnalysis | undefined
  dismissAnalysis: (id: string) => void
  markComplete: (id: string, responses: PersonaResponse[], synthesis?: ArtifactSynthesis | null) => void
  markError: (id: string, error: string) => void
  markCancelled: (id: string) => void
}

const STORAGE_VERSION = 3;

/** Statuses a run never leaves. */
const TERMINAL_STATUSES: AnalysisStatus[] = ['COMPLETED', 'ERROR', 'CANCELLED']

/**
 * Whether a terminal record may be overwritten, and by what.
 *
 * Every surface acts on a *believed* state — a toast that last saw the run in
 * flight, a card rehydrated from a previous page load — and the poller trails
 * the server by up to one cadence, so a terminal write can arrive after the run
 * has really finished. Terminal is therefore terminal: the outcome a record
 * already holds is the one the card, the toast, the report and the hook all
 * read, and a late cancel or error cannot replace it with a run that never
 * finished. Without this, cancelling a run the client still believed live
 * discarded the completed result underneath it.
 *
 * The one exception is a result superseding a cancellation. A cancel means
 * "stop this run"; if the server had already produced the report, the cancel
 * stopped nothing, and throwing the result away would discard the work the user
 * paid for. Nothing else supersedes anything: a completion cannot replace an
 * error, a cancellation cannot replace either, and a settled record stays as it
 * settled.
 */
function mayOverwrite(current: AnalysisStatus, next: AnalysisStatus): boolean {
  if (!TERMINAL_STATUSES.includes(current)) return true
  return next === 'COMPLETED' && current === 'CANCELLED'
}

export const useAnalysisStore = create<AnalysisStoreState>()(
  persist(
    (set, get) => ({
      analyses: [],
      dismissedAnalysisIds: [],

      dismissAnalysis: (id) =>
        set((state) => ({
          dismissedAnalysisIds: state.dismissedAnalysisIds.includes(id)
            ? state.dismissedAnalysisIds
            : [...state.dismissedAnalysisIds, id],
        })),

      addAnalysis: (analysis) =>
        set((state) => ({
          analyses: [analysis, ...state.analyses],
        })),

      updateAnalysis: (id, updates) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),

      removeAnalysis: (id) =>
        set((state) => ({
          analyses: state.analyses.filter((a) => a.id !== id),
        })),

      getAnalysis: (id) => get().analyses.find((a) => a.id === id),

      markComplete: (id, responses, synthesis) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id && mayOverwrite(a.status, 'COMPLETED')
              ? {
                  ...a,
                  status: 'COMPLETED' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                  // Both counts come from the same predicate the report and the
                  // synthesis use, so a run with failed personas cannot show a
                  // full denominator next to a report that has gaps in it.
                  completedResponses: completedResponses(responses).length,
                  totalResponses: responses.length,
                  responses,
                  // `undefined` leaves any existing synthesis untouched.
                  ...(synthesis !== undefined ? { synthesis: synthesis ?? undefined } : {}),
                }
              : a
          ),
        })),

      markError: (id, error) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id && mayOverwrite(a.status, 'ERROR')
              ? {
                  ...a,
                  status: 'ERROR' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                  // Last boundary before error text becomes display state: it
                  // may have been written by this app, or arrive from a
                  // backend build we do not control, and engine text must not
                  // reach the screen either way.
                  error: humanizeAnalysisError(error),
                }
              : a
          ),
        })),

      markCancelled: (id) =>
        set((state) => ({
          analyses: state.analyses.map((a) =>
            a.id === id && mayOverwrite(a.status, 'CANCELLED')
              ? {
                  ...a,
                  status: 'CANCELLED' as AnalysisStatus,
                  completedAt: new Date().toISOString(),
                }
              : a
          ),
        })),
    }),
    {
      name: 'analysis-storage',
      version: STORAGE_VERSION,
      migrate(persistedState, version) {
        if (version < STORAGE_VERSION) {
          return { analyses: [], dismissedAnalysisIds: [] } as AnalysisPersistedState;
        }
        return persistedState as AnalysisPersistedState;
      },
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        analyses: state.analyses.map(({ streamingTexts, screenshot, responses, ...rest }) => ({
          ...rest,
          // Strip base64 screenshots from each response to keep storage lean.
          // Screenshots are served via the server-side screenshot store on demand.
          responses: responses?.map(({ screenshotBase64, ...rest }) => rest),
        })),
        dismissedAnalysisIds: state.dismissedAnalysisIds,
      }),
    }
  )
)
