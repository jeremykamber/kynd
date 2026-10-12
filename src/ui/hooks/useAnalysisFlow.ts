/**
 * Client-side driver for a single artifact analysis run.
 *
 * Owns the request inputs (artifact URL or screenshot, business goal, research
 * question) and the settled `analyses`/`synthesis` handed back to the caller.
 * The run itself lives in `useAnalysisStore`, which is the single place a run's
 * status and progress land: this hook writes the RSC stream into it (local
 * mode), the global `AnalysisToaster` poller advances it (the VPS, or when the
 * page that started the run was reloaded), and `isPending`/`analysisProgress`
 * read it back. Nothing is tracked twice, so a reloaded page resumes live
 * progress instead of showing a frozen bar.
 *
 * Triggers `analyzeArtifactAction` (server action) and prefers its stream via
 * `readStreamableValue`. When the action returns no stream — the remote/VPS
 * deployment — progress and completion arrive through the store alone.
 *
 * The caller observes completion through `onSuccess(analyses, synthesis)` and
 * through `useAnalysisStore` status transitions (`COMPLETED`/`ERROR`/
 * `CANCELLED`). `error` carries cancellation and failure messages.
 */

import { useState, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { ArtifactSynthesis } from '@/domain/entities/ArtifactSynthesis'
import { analyzeArtifactAction } from '@/actions/analyzeArtifactAction'
import type { ArtifactInput } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import { getScreenshotAction } from '@/actions/getScreenshot'
import { cancelRequestAction } from '@/actions/cancelRequest'
import { readStreamableValue } from '@ai-sdk/rsc'
import { generateAnalysisName } from '@/domain/entities/ArtifactAnalysis'
import type { AnalysisProgressStep, ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import { useAnalysisStore } from '@/ui/stores/analysisStore'

export interface AnalysisProgress {
  step: AnalysisProgressStep | 'DONE' | 'ERROR' | 'CANCELLED'
  screenshot?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  /** AI-generated run title; adopted as the run's name when present. */
  title?: string
  error?: string
  analyses?: PersonaResponse[]
  synthesis?: ArtifactSynthesis | null
}

/** Bound on waiting for a run to settle — ten minutes, as the polling loop it replaced. */
const RUN_SETTLE_TIMEOUT_MS = 600_000

/**
 * Resolves with a run's store entry once it reaches a terminal status, or
 * immediately when it already has (e.g. the cancel path below). Progress and
 * completion are owned by the store — the global `AnalysisToaster` poller
 * settles remote runs — so waiting on the record is what lets this hook follow
 * a run without polling the server a second time.
 */
function awaitRunSettled(runId: string, signal: AbortSignal): Promise<ArtifactAnalysis | undefined> {
  const settled = useAnalysisStore.getState().analyses.find((a) => a.id === runId)
  if (settled && settled.status !== 'IN_PROGRESS') return Promise.resolve(settled)

  const { promise, resolve } = Promise.withResolvers<ArtifactAnalysis | undefined>()
  let unsubscribe = () => {}
  let timeout: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    clearTimeout(timeout)
    unsubscribe()
    signal.removeEventListener('abort', finish)
    resolve(useAnalysisStore.getState().analyses.find((a) => a.id === runId))
  }

  unsubscribe = useAnalysisStore.subscribe((state) => {
    const run = state.analyses.find((a) => a.id === runId)
    if (run && run.status !== 'IN_PROGRESS') finish()
  })
  signal.addEventListener('abort', finish)
  // A run whose progress never lands (the backend lost it) must not be waited
  // on forever: the same ten-minute bound the per-second polling loop carried.
  timeout = setTimeout(finish, RUN_SETTLE_TIMEOUT_MS)

  return promise
}

export function useAnalysisFlow(onSuccess?: (analyses: PersonaResponse[], synthesis?: ArtifactSynthesis | null) => void) {
  const [artifactUrl, setArtifactUrl] = useState('')
  const [artifactImageBase64, setArtifactImageBase64] = useState<string | null>(null)
  const [businessGoal, setBusinessGoal] = useState('')
  const [researchQuestion, setResearchQuestion] = useState('')
  const [analyses, setAnalyses] = useState<PersonaResponse[] | null>(null)
  const [synthesis, setSynthesis] = useState<ArtifactSynthesis | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The run this hook started, filed under the id the server runs it under. */
  const [runId, setRunId] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const onSuccessRef = useRef(onSuccess)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useAnalysisStore((s) => (runId ? s.analyses.find((a) => a.id === runId) : undefined))
  const isPending = run?.status === 'IN_PROGRESS'

  // Live progress as the store reports it — the hook holds no copy of its own.
  const analysisProgress: AnalysisProgress | null = run && isPending
    ? {
        step: run.currentStep ?? 'STARTING',
        completedCount: run.completedResponses,
        totalCount: run.totalResponses,
        ...(run.screenshot ? { screenshot: run.screenshot } : {}),
      }
    : null

  /**
   * Cancels a run: marks the run cancelled in the store (the record the card,
   * the toast and this hook all read), aborts the local stream, then tells the
   * server. `analysisId` defaults to the run this hook started; pass one to
   * cancel a run this tab did not start (a list card rehydrated after a
   * reload). The server keys a run by the same id the store files it under, so
   * that id is also the cancel request id.
   */
  const handleCancel = async (analysisId?: string) => {
    const cancelledRunId = analysisId ?? runId
    if (!cancelledRunId) return

    // The record flips first: cancelling is the user's intent, and the card,
    // the toast and this hook all read the record. The server is told after,
    // best effort — a slow or refused signal must not leave the UI claiming a
    // run the user has stopped is still live.
    useAnalysisStore.getState().markCancelled(cancelledRunId)
    if (cancelledRunId === runId) abortControllerRef.current?.abort()

    try {
      await cancelRequestAction(cancelledRunId)
    } catch {
      // The run is cancelled as far as this app is concerned; it stops on the
      // backend as soon as it notices.
    }
  }

  const handleAnalyzeArtifact = (
    personas: Persona[],
    overrideInput?: ArtifactInput,
    overrideBusinessGoal?: string,
    overrideResearchQuestion?: string,
    batchId?: string,
  ) => {
    const activeGoal = (overrideBusinessGoal || businessGoal).trim()
    const activeQuestion = (overrideResearchQuestion || researchQuestion).trim()

    if (!overrideInput && !artifactUrl.trim() && !artifactImageBase64) return
    if (!personas || personas.length === 0) return

    setError(null)
    const controller = new AbortController()
    abortControllerRef.current = controller

    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const resolvedInput: ArtifactInput = overrideInput || (artifactImageBase64
      ? { type: 'screenshot', imageBase64: artifactImageBase64, url: artifactUrl || undefined }
      : { type: 'url', url: artifactUrl })

    // The store records the run before it starts, under the very id the server
    // runs it under, so progress from either side lands on the same entry.
    useAnalysisStore.getState().addAnalysis({
      id: analysisId,
      name: generateAnalysisName('url' in resolvedInput ? resolvedInput.url || 'Screenshot Upload' : 'Screenshot Upload'),
      url: 'url' in resolvedInput ? resolvedInput.url || '' : '',
      status: 'IN_PROGRESS',
      personaCount: personas.length,
      personaNames: personas.map((p) => p.name),
      createdAt: new Date().toISOString(),
      currentStep: 'STARTING',
      completedResponses: 0,
      totalResponses: personas.length,
      batchId,
    })
    setRunId(analysisId)

    void (async () => {
      let screenshotPollInterval: ReturnType<typeof setInterval> | undefined

      try {
        const { streamData } = await analyzeArtifactAction(
          resolvedInput,
          personas,
          activeGoal,
          activeQuestion,
          analysisId,
        )

        // The artifact screenshot is served separately from the run, so it is
        // fetched while the run is live (the stream carries the steps).
        screenshotPollInterval = setInterval(async () => {
          try {
            const result = await getScreenshotAction(analysisId)
            if (result.found && result.base64) {
              useAnalysisStore.getState().updateAnalysis(analysisId, { screenshot: result.base64 })
            }
          } catch { /* non-critical */ }
        }, 2000)

        if (streamData) {
          // Local mode streams the steps; they land in the store and nowhere
          // else, so the toast and the list cannot disagree with them.
          for await (const raw of readStreamableValue(streamData)) {
            if (controller.signal.aborted) break
            const update: AnalysisProgress | undefined = raw
            if (!update) continue

            if (update.step === 'DONE') {
              useAnalysisStore.getState().markComplete(analysisId, update.analyses ?? [], update.synthesis)
              break
            }
            if (update.step === 'ERROR') {
              useAnalysisStore.getState().markError(analysisId, update.error ?? 'Analysis failed')
              break
            }
            if (update.step === 'CANCELLED') {
              useAnalysisStore.getState().markCancelled(analysisId)
              break
            }

            useAnalysisStore.getState().updateAnalysis(analysisId, {
              ...(update.step ? { currentStep: update.step } : {}),
              ...(update.completedCount !== undefined ? { completedResponses: update.completedCount } : {}),
              ...(update.screenshot ? { screenshot: update.screenshot } : {}),
              ...(update.title ? { name: update.title } : {}),
            })
          }
        }

        // Both modes end here: wait for the run's record to settle, whether
        // this stream settled it or the global poller did.
        const settled = await awaitRunSettled(analysisId, controller.signal)
        if (!mountedRef.current) return

        if (settled?.status === 'COMPLETED') {
          setAnalyses(settled.responses ?? null)
          setSynthesis(settled.synthesis ?? null)
          onSuccessRef.current?.(settled.responses ?? [], settled.synthesis ?? null)
        } else if (settled?.status === 'CANCELLED') {
          setError('Analysis was cancelled')
        } else if (settled?.status === 'ERROR') {
          setError(settled.error ?? 'Analysis failed')
        } else {
          // Nothing settled the run — it is lost, not still running, and a run
          // left "in progress" forever is exactly what the list must not show.
          useAnalysisStore.getState().markError(analysisId, 'Analysis timed out. Please try again.')
          setError('Analysis timed out. Please try again.')
        }
      } catch (err) {
        useAnalysisStore.getState().markError(analysisId, (err as Error).message)
        if (mountedRef.current) setError((err as Error).message)
      } finally {
        clearInterval(screenshotPollInterval)
      }
    })()
  }

  return {
    artifactUrl,
    setArtifactUrl,
    artifactImageBase64,
    setArtifactImageBase64,
    businessGoal,
    setBusinessGoal,
    researchQuestion,
    setResearchQuestion,
    analyses,
    setAnalyses,
    synthesis,
    setSynthesis,
    error,
    setError,
    isPending,
    analysisProgress,
    handleAnalyzeArtifact,
    handleCancel,
  }
}
