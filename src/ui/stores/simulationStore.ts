import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Simulation, SimulationStatus } from '@/domain/entities/Simulation'
import { PricingAnalysis } from '@/domain/entities/PricingAnalysis'

interface SimulationStoreState {
  simulations: Simulation[]
  dismissedSimulationIds: string[]
  addSimulation: (simulation: Simulation) => void
  updateSimulation: (id: string, updates: Partial<Simulation>) => void
  removeSimulation: (id: string) => void
  getSimulation: (id: string) => Simulation | undefined
  dismissSimulation: (id: string) => void
  markComplete: (id: string, analyses: PricingAnalysis[]) => void
  markError: (id: string, error: string) => void
  markCancelled: (id: string) => void
}

export const useSimulationStore = create<SimulationStoreState>()(
  persist(
    (set, get) => ({
      simulations: [],
      dismissedSimulationIds: [],

      dismissSimulation: (id) =>
        set((state) => ({
          dismissedSimulationIds: state.dismissedSimulationIds.includes(id)
            ? state.dismissedSimulationIds
            : [...state.dismissedSimulationIds, id],
        })),

      addSimulation: (simulation) =>
        set((state) => ({
          simulations: [simulation, ...state.simulations],
        })),

      updateSimulation: (id, updates) =>
        set((state) => ({
          simulations: state.simulations.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeSimulation: (id) =>
        set((state) => ({
          simulations: state.simulations.filter((s) => s.id !== id),
        })),

      getSimulation: (id) => get().simulations.find((s) => s.id === id),

      markComplete: (id, analyses) =>
        set((state) => ({
          simulations: state.simulations.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: 'COMPLETED' as SimulationStatus,
                  completedAt: new Date().toISOString(),
                  completedAnalyses: analyses.length,
                  analyses,
                }
              : s
          ),
        })),

      markError: (id, error) =>
        set((state) => ({
          simulations: state.simulations.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: 'ERROR' as SimulationStatus,
                  completedAt: new Date().toISOString(),
                  error,
                }
              : s
          ),
        })),

      markCancelled: (id) =>
        set((state) => ({
          simulations: state.simulations.map((s) =>
            s.id === id
              ? {
                  ...s,
                  status: 'CANCELLED' as SimulationStatus,
                  completedAt: new Date().toISOString(),
                }
              : s
          ),
        })),
    }),
    {
      name: 'simulation-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist metadata, not streaming data
      partialize: (state) => ({
        simulations: state.simulations.map(({ streamingTexts, screenshot, ...rest }) => rest),
        dismissedSimulationIds: state.dismissedSimulationIds,
      }),
    }
  )
)
