import type { PersonaResponse } from './PersonaResponse'
import type { ArtifactSynthesis } from './ArtifactSynthesis'
import type { ArtifactInputKind } from './ArtifactInput'
import { SCREENSHOT_LABEL } from './ArtifactIntakeLimits'

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
    /** How the artifact entered: url, screenshot, or text. Absent on older records. */
    inputKind?: ArtifactInputKind
    /** Display label for screenshot ("Screenshot") and text runs. */
    label?: string
    /** Source document names for a text run, in selection order. */
    sourceFiles?: string[]
    /** Extracted or pasted artifact text, kept so the report survives reload. */
    text?: string
}

/**
 * The artifact kind for a record. Older records predate `inputKind`; they
 * stored the literal "Screenshot Upload" in `url` for uploads.
 */
export function analysisInputKind(analysis: ArtifactAnalysis): ArtifactInputKind {
    if (analysis.inputKind) return analysis.inputKind
    return analysis.url === 'Screenshot Upload' ? 'screenshot' : 'url'
}

/** What the dashboard and detail page call the artifact source. */
export function analysisSourceLabel(analysis: ArtifactAnalysis): string | undefined {
    const kind = analysisInputKind(analysis)
    if (kind === 'url') return undefined
    if (analysis.label) return analysis.label
    return kind === 'screenshot' ? SCREENSHOT_LABEL : undefined
}

/** Longest source label kept in a generated analysis name. */
const MAX_NAME_LABEL = 60

/**
 * Builds the display name for an analysis from its source, optionally
 * qualified by the persona batch it runs over (e.g. `"Founders" on acme`).
 * A URL names itself; a screenshot or text run uses its label.
 */
export function generateAnalysisName(
    source: { kind: ArtifactInputKind; url?: string; label?: string },
    batchName?: string,
): string {
    if (source.kind === 'screenshot') {
        return batchName
            ? `"${batchName}" — ${SCREENSHOT_LABEL}`
            : `Analysis — ${SCREENSHOT_LABEL}`
    }

    if (source.kind === 'text') {
        const raw = source.label?.trim() || 'Text'
        const label = raw.length > MAX_NAME_LABEL ? `${raw.slice(0, MAX_NAME_LABEL - 1)}…` : raw
        return batchName
            ? `"${batchName}" — ${label}`
            : `Analysis — ${label}`
    }

    const url = source.url?.trim() || ''
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
