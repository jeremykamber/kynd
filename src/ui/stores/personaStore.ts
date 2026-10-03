/**
 * Persona batches produced by generation runs, and which runs are still in
 * flight.
 *
 * Everything is persisted to IndexedDB under `persona-storage` with no
 * `partialize` and no `version`, so a shape change reaches stored data
 * unmigrated. `activeGenerationRunIds` is persisted deliberately: the
 * `PersonaProgressToaster` polls it after a reload to resume reporting
 * background runs, and entries are removed only when the toast settles or the
 * user cancels.
 *
 * `addBatch` does not change `activeBatchId`; navigation to a new batch is an
 * explicit user action. Mutations against an unknown batch or persona id are
 * no-ops.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Persona } from '@/domain/entities/Persona'
import { indexedDBStorage } from '@/infrastructure/services/indexedDBStorage'

export interface PersonaBatch {
  id: string
  label: string
  source: 'description' | 'interviews'
  transcriptCount?: number
  createdAt: string
  personas: Persona[]
}

export interface InProgressBatch {
  id: string
  runId: string
  label: string
  source: 'description' | 'interviews'
  createdAt: number
}

interface PersonaStoreState {
  batches: PersonaBatch[]
  activeBatchId: string | null
  activeGenerationRunIds: string[]

  addBatch: (batch: PersonaBatch) => void
  setActiveBatch: (id: string | null) => void
  removeBatch: (id: string) => void
  updateBatchLabel: (id: string, label: string) => void
  removePersona: (batchId: string, personaId: string) => void
  getActiveBatch: () => PersonaBatch | undefined
  /** Insert placeholder personas into the active batch after the reference persona */
  insertPersonasAfter: (batchId: string, afterPersonaId: string, personas: Persona[]) => void
  /** Update a specific persona in a batch (for replacing placeholders with real data) */
  updatePersona: (batchId: string, personaId: string, updates: Partial<Persona>) => void
  /** Track a generation runId for background toast polling */
  addActiveGeneration: (runId: string) => void
  removeActiveGeneration: (runId: string) => void
}

export const usePersonaStore = create<PersonaStoreState>()(
  persist(
    (set, get) => ({
      batches: [],
      activeBatchId: null,
      activeGenerationRunIds: [],

      addBatch: (batch) =>
        set((state) => ({
          batches: [batch, ...state.batches],
          // Intentionally not activating the new batch: the user stays on the
          // batch list and navigates via the "View Batch" toast or a card.
        })),

      setActiveBatch: (id) => set({ activeBatchId: id }),

  removeBatch: (id) =>
    set((state) => ({
      batches: state.batches.filter((b) => b.id !== id),
      activeBatchId: state.activeBatchId === id ? null : state.activeBatchId,
    })),

  updateBatchLabel: (id, label) =>
    set((state) => ({
      batches: state.batches.map((b) =>
        b.id === id ? { ...b, label } : b,
      ),
    })),

  removePersona: (batchId, personaId) =>
    set((state) => ({
      batches: state.batches.map((b) =>
        b.id === batchId
          ? { ...b, personas: b.personas.filter((p) => p.id !== personaId) }
          : b,
      ),
    })),

      getActiveBatch: () => {
        const { batches, activeBatchId } = get()
        return batches.find((b) => b.id === activeBatchId)
      },

      insertPersonasAfter: (batchId, afterPersonaId, personas) =>
        set((state) => ({
          batches: state.batches.map((b) => {
            if (b.id !== batchId) return b
            const insertIdx = b.personas.findIndex((p) => p.id === afterPersonaId)
            if (insertIdx === -1) return b
            const updated = [...b.personas]
            updated.splice(insertIdx + 1, 0, ...personas)
            return { ...b, personas: updated }
          }),
        })),

      updatePersona: (batchId, personaId, updates) =>
        set((state) => ({
          batches: state.batches.map((b) => {
            if (b.id !== batchId) return b
            return {
              ...b,
              personas: b.personas.map((p) =>
                p.id === personaId ? { ...p, ...updates } : p,
              ),
            }
          }),
        })),

      addActiveGeneration: (runId) =>
        set((state) => ({
          activeGenerationRunIds: state.activeGenerationRunIds.includes(runId)
            ? state.activeGenerationRunIds
            : [...state.activeGenerationRunIds, runId],
        })),

      removeActiveGeneration: (runId) =>
        set((state) => ({
          activeGenerationRunIds: state.activeGenerationRunIds.filter((id) => id !== runId),
        })),
    }),
    {
      name: 'persona-storage',
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
)
