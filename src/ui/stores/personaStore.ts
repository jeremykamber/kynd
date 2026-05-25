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
  getActiveBatch: () => PersonaBatch | undefined
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

      getActiveBatch: () => {
        const { batches, activeBatchId } = get()
        return batches.find((b) => b.id === activeBatchId)
      },
    }),
    {
      name: 'persona-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
