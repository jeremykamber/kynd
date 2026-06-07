import { PricingAnalysis } from '@/domain/entities/PricingAnalysis'

interface StoredSimulation {
  analyses: PricingAnalysis[]
  completedAt: string
  error?: string
}

/**
 * Server-side in-memory store for completed simulation results.
 * Simulations run in a fire-and-forget IIFE inside the server action.
 * When the client disconnects (reload/navigate away), the IIFE continues
 * running but the streaming response has no reader. This store captures
 * the results so they can be fetched on reconnection.
 *
 * Results are kept for 30 minutes after completion, then cleaned up.
 */
class SimulationResultStore {
  private results = new Map<string, StoredSimulation>()
  private cleanups = new Map<string, ReturnType<typeof setTimeout>>()

  save(runId: string, analyses: PricingAnalysis[]): void {
    this.results.set(runId, {
      analyses,
      completedAt: new Date().toISOString(),
    })
    this.scheduleCleanup(runId)
  }

  saveError(runId: string, error: string): void {
    this.results.set(runId, {
      analyses: [],
      completedAt: new Date().toISOString(),
      error,
    })
    this.scheduleCleanup(runId)
  }

  get(runId: string): StoredSimulation | undefined {
    return this.results.get(runId)
  }

  remove(runId: string): void {
    this.results.delete(runId)
    const timer = this.cleanups.get(runId)
    if (timer) {
      clearTimeout(timer)
      this.cleanups.delete(runId)
    }
  }

  private scheduleCleanup(runId: string): void {
    const existing = this.cleanups.get(runId)
    if (existing) clearTimeout(existing)
    this.cleanups.set(
      runId,
      setTimeout(() => this.remove(runId), 30 * 60 * 1000),
    )
  }
}

export const simulationResultStore = new SimulationResultStore()
