/**
 * Client-side driver for persona generation from uploaded interview
 * transcripts.
 *
 * Owns the uploaded files (name + text content), the requested persona count,
 * the generation mode (`individual` transcripts vs a `synthesized` group),
 * live pipeline progress, and the resulting `personas`. It submits the files as
 * multipart FormData to `generatePersonasFromInterviewsAction`, which returns
 * either a stream or a run id.
 *
 * Remote (VPS) runs are not polled here. `PersonaProgressToaster` already
 * watches every active run and writes its batch, so this hook watches the
 * *store* instead: when a batch carrying its run id appears, the run has
 * settled and its personas (or its failure) are the run's outcome. That used to
 * be a second 2s result loop and a second 2s progress loop — two of the three
 * pollers the audit measured at 2.7 POSTs/second on one run — both of which
 * could only ever learn what the toaster already knew.
 *
 * Progress is still fetched, because the page's step dialog renders live counts;
 * the fetch goes through the shared cadence in `@/lib/personaRunPolling`, so it
 * costs nothing when the toaster is already looking at the same run. `progress`
 * is non-null only while a run is active.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasFromInterviewsAction } from '@/actions/generatePersonasFromInterviews'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { readStreamableValue } from '@ai-sdk/rsc'
import { persistPersonaBatchForRun } from '@/lib/personaRunOutcome'
import { observePersonaRun, runStatusText, startPersonaRunPolling } from '@/lib/personaRunPolling'
import {
  buildInterviewFormData,
  rememberInterviewRun,
  type InterviewRunInput,
} from '@/lib/personaRunSubmission'

export type InterviewProgressStep = 'UPLOADING' | 'EXTRACTING' | 'POOLING' | 'SAMPLING' | 'GENERATING' | 'INGESTING' | 'DONE' | 'ERROR'

export interface InterviewProgress {
  step: InterviewProgressStep
  current?: number
  total?: number
  message?: string
  personas?: Persona[]
  error?: string
}

export interface InterviewFile {
  id: string
  name: string
  content: string
}

/**
 * One update from the pipeline's stream. The terminal steps carry their
 * payload, so handling them needs no non-null assertions.
 */
type InterviewStreamUpdate =
  | { step: Exclude<InterviewProgressStep, 'DONE' | 'ERROR'>; current?: number; total?: number; message?: string }
  | { step: 'DONE'; personas: Persona[] }
  | { step: 'ERROR'; error: string }

export function useInterviewPipeline() {
  const [files, setFiles] = useState<InterviewFile[]>([])
  const [personaCount, setPersonaCount] = useState(3)
  const [generationMode, setGenerationMode] = useState<'individual' | 'synthesized'>('individual')
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<InterviewProgress | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    }
  }, [])

  /**
   * The batch the run settled into, written by whichever surface saw it first.
   * This is the hook's only source of truth for "how did the run end".
   */
  const settledBatch = usePersonaStore((s) =>
    runId ? s.batches.find((batch) => batch.runId === runId) : undefined,
  )
  const runIsTracked = usePersonaStore((s) =>
    runId ? s.activeGenerationRunIds.includes(runId) : false,
  )

  useEffect(() => {
    if (!settledBatch) return
    setProgress(null)
    setIsPending(false)
    if (settledBatch.error) {
      setError(settledBatch.error)
      return
    }
    if (settledBatch.personas.length > 0) setPersonas(settledBatch.personas)
  }, [settledBatch])

  // A run that leaves the tracker without a batch (cancelled by the user, or
  // stalled before it reported anything) must not leave the page spinning.
  useEffect(() => {
    if (!runId || runIsTracked) return
    setProgress(null)
    setIsPending(false)
  }, [runId, runIsTracked])

  // Live counts for the page's step dialog. The shared cadence and fetch gate
  // mean this shares the toaster's round trips rather than adding its own.
  useEffect(() => {
    if (!runId || !runIsTracked) return

    return startPersonaRunPolling(async () => {
      const observation = await observePersonaRun(runId)
      const state = observation.progress
      if (!state?.step || !mountedRef.current) return
      setProgress({
        step: state.step as InterviewProgress['step'],
        current: state.completedCount ?? state.completedResponses,
        total: state.totalCount ?? state.totalResponses,
        // Retry chatter is internal: the dialog shows the step's neutral label.
        message: runStatusText(state),
        error: state.error,
      })
    })
  }, [runId, runIsTracked])

  const addFile = (name: string, content: string) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFiles((prev) => [...prev, { id, name, content }])
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const clearFiles = () => setFiles([])

  const handleSubmit = useCallback(() => {
    if (files.length === 0) return

    setError(null)
    setPersonas(null)
    setRunId(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setProgress({ step: 'UPLOADING' })
    setIsPending(true)

    const input: InterviewRunInput = {
      transcripts: files.map((file) => ({ name: file.name, content: file.content })),
      personaCount,
      mode: generationMode,
    }

    void (async () => {
      try {
        const result = await generatePersonasFromInterviewsAction(buildInterviewFormData(input))
        const streamData = result.streamData
        const id: string | undefined = result.runId
        setIsPending(false) // core action returned — release loading state

        if (id) {
          // Remembered so the terminal toast can offer Retry, and tracked so
          // the toaster reports the run wherever the user goes next.
          rememberInterviewRun(id, input)
          usePersonaStore.getState().addActiveGeneration(id)
          setRunId(id)
        }

        if (!streamData) return // remote: the store carries the run's outcome

        for await (const update of readStreamableValue<InterviewStreamUpdate>(streamData)) {
          if (controller.signal.aborted || !mountedRef.current) return

          if (!update) continue

          if (update.step === 'ERROR') {
            setError(update.error)
            setProgress(null)
            abortControllerRef.current = null
            return
          }

          if (update.step === 'DONE') {
            const fallbackLabel = `${files.length} Interview${files.length !== 1 ? 's' : ''}${files.length > 0 ? ' (' + files[0].name + (files.length > 1 ? ` +${files.length - 1}` : '') + ')' : ''}`
            await persistPersonaBatchForRun({
              runId: id,
              personas: update.personas,
              source: 'interviews',
              transcriptCount: files.length,
              fallbackLabel,
            })
            if (mountedRef.current) {
              setPersonas(update.personas)
              setProgress(null)
              abortControllerRef.current = null
            }
            return
          }

          if (mountedRef.current) {
            setProgress({
              step: update.step,
              current: update.current,
              total: update.total,
              message: update.message,
            })
          }
        }
      } catch (err) {
        setIsPending(false)
        if (!controller.signal.aborted && mountedRef.current) {
          setError((err as Error).message)
          setProgress(null)
          abortControllerRef.current = null
        }
      }
    })()
  }, [files, personaCount, generationMode])

  return {
    files,
    addFile,
    removeFile,
    clearFiles,
    personaCount,
    setPersonaCount,
    generationMode,
    setGenerationMode,
    personas,
    error,
    isPending,
    progress,
    runId,
    handleSubmit,
  }
}
