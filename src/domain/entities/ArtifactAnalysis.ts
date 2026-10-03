import type { PersonaResponse } from './PersonaResponse'
import type { ArtifactSynthesis } from './ArtifactSynthesis'

/** Terminal or in-flight state of an analysis run. */
export type AnalysisStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

/** Fine-grained position of an in-progress analysis, used for progress UI. */
export type AnalysisProgressStep =
  | 'STARTING'
  | 'INTAKE'
  | 'ANALYZING'
  | 'DONE'
  | 'ERROR'
  | 'CANCELLED'

/**
 * One artifact analysis run over a persona cohort: its progress, partially
 * streamed persona responses, and — once complete — the cross-persona
 * synthesis. This is the resumable/observable view of the run; the per-persona
 * results inside `responses` are the analysis output.
 */
export interface ArtifactAnalysis {
    id: string
    name: string
    url: string
    status: AnalysisStatus
    batchId?: string
    batchName?: string
    personaCount: number
    personaNames?: string[]
    createdAt: string
    completedAt?: string
    currentStep?: AnalysisProgressStep
    /** Personas whose response has completed so far, out of totalResponses. */
    completedResponses?: number
    totalResponses?: number
    responses?: PersonaResponse[]
    screenshot?: string
    streamingTexts?: Record<string, string>
    error?: string
    synthesis?: ArtifactSynthesis
}

/**
 * Builds the display name for an analysis from its URL, optionally qualified
 * by the persona batch it runs over (e.g. `"Founders" on acme`). Uploaded
 * screenshots, which have no URL, fall back to the batch name.
 */
export function generateAnalysisName(url: string, batchName?: string): string {
    if (url === "Screenshot Upload") {
        return batchName
            ? `"${batchName}" — Screenshot`
            : 'Analysis — Screenshot'
    }
    try {
        const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        const siteName = hostname.replace(/^www\./, '').split('.')[0]
        return batchName
            ? `"${batchName}" on ${siteName}`
            : `Analysis — ${siteName}`
    } catch {
        return batchName
            ? `"${batchName}" — ${url}`
            : `Analysis — ${url}`
    }
}
