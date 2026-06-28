import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Persona } from '@/domain/entities/Persona'

export interface PersonaBatch {
  id: string
  label: string
  source: 'description' | 'interviews'
  transcriptCount?: number
  createdAt: string
  personas: Persona[]
}

interface PersonaStoreState {
  batches: PersonaBatch[]
  activeBatchId: string | null

  addBatch: (batch: PersonaBatch) => void
  setActiveBatch: (id: string | null) => void
  removeBatch: (id: string) => void
  removePersona: (batchId: string, personaId: string) => void
  getActiveBatch: () => PersonaBatch | undefined
  /** Insert placeholder personas into the active batch after the reference persona */
  insertPersonasAfter: (batchId: string, afterPersonaId: string, personas: Persona[]) => void
  /** Update a specific persona in a batch (for replacing placeholders with real data) */
  updatePersona: (batchId: string, personaId: string, updates: Partial<Persona>) => void
}

export const usePersonaStore = create<PersonaStoreState>()(
  persist(
    (set, get) => ({
      batches: [],
      activeBatchId: null,

      addBatch: (batch) =>
        set((state) => ({
          batches: [batch, ...state.batches],
          activeBatchId: batch.id,
        })),

      setActiveBatch: (id) => set({ activeBatchId: id }),

  removeBatch: (id) =>
    set((state) => ({
      batches: state.batches.filter((b) => b.id !== id),
      activeBatchId: state.activeBatchId === id ? null : state.activeBatchId,
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
    }),
    {
      name: 'persona-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
