import { getStore } from '@netlify/blobs'

export type PipelineType = 'interviews' | 'pricing'
export type PipelineStatus = 'queued' | 'extracting' | 'pooling' | 'sampling' | 'generating' | 'ingesting' | 'scouting' | 'analyzing' | 'compiling' | 'completed' | 'failed'

export interface PipelineState {
  jobId: string
  type: PipelineType
  status: PipelineStatus
  progress?: number
  total?: number
  message?: string
  error?: string
  createdAt: string
  updatedAt: string
}

/**
 * Durable pipeline state store backed by Netlify Blobs.
 *
 * Pipeline state persists across function invocations and Lambda instances,
 * enabling background processing that exceeds the synchronous function
 * timeout limit (10-60s depending on plan).
 *
 * Three blob stores:
 *   pipeline-states  — current status + progress metadata
 *   pipeline-inputs  — request data (transcripts, personas, URL)
 *   pipeline-outputs — final result (personas, analyses)
 */
export class PipelineStore {
  private static STATES = 'pipeline-states'
  private static INPUTS = 'pipeline-inputs'
  private static OUTPUTS = 'pipeline-outputs'

  async saveState(state: PipelineState): Promise<void> {
    const store = getStore(PipelineStore.STATES)
    await store.setJSON(state.jobId, state)
  }

  async getState(jobId: string): Promise<PipelineState | null> {
    const store = getStore(PipelineStore.STATES)
    return store.get(jobId, { type: 'json' }) as Promise<PipelineState | null>
  }

  async updateState(jobId: string, partial: Partial<PipelineState>): Promise<PipelineState | null> {
    const existing = await this.getState(jobId)
    if (!existing) return null
    const updated = { ...existing, ...partial, updatedAt: new Date().toISOString() }
    await this.saveState(updated)
    return updated
  }

  async saveInput(jobId: string, data: unknown): Promise<void> {
    const store = getStore(PipelineStore.INPUTS)
    await store.setJSON(jobId, data)
  }

  async getInput<T>(jobId: string): Promise<T | null> {
    const store = getStore(PipelineStore.INPUTS)
    return store.get(jobId, { type: 'json' }) as Promise<T | null>
  }

  async saveOutput(jobId: string, data: unknown): Promise<void> {
    const store = getStore(PipelineStore.OUTPUTS)
    await store.setJSON(jobId, data)
  }

  async getOutput<T>(jobId: string): Promise<T | null> {
    const store = getStore(PipelineStore.OUTPUTS)
    return store.get(jobId, { type: 'json' }) as Promise<T | null>
  }
}

export const pipelineStore = new PipelineStore()
