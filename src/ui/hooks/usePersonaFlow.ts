/**
 * Client-side driver for ICP persona generation from a written description.
 *
 * Owns the form inputs (the customer profile prompt and requested persona
 * count), the live generation progress, the resulting `personas`, the id of the
 * batch most recently added to the store, and the single submitting state both
 * setup modes read. It always requests `strategy`-mode personas — rich
 * storytelling rather than the description pipeline — via
 * `generatePersonasAction`.
 *
 * On completion it hands the run's outcome to `persistPersonaBatchForRun`,
 * which writes the batch unless another observer (the background toaster) got
 * there first, then activates that batch and moves to the dashboard, so a
 * finished run is where the user lands instead of on the form that started it.
 * When the action returns no stream (remote/VPS) it stores the run id and the
 * effect watches it through `@/lib/personaRunPolling`: the same cadence,
 * single-flight fetch and stall verdict the app-wide toast and
 * `/dashboard/generating/<runId>` use, so one run costs one set of round trips
 * no matter how many surfaces are watching it.
 *
 * `isSubmitting` spans the whole run, not just the action call: from submit
 * until the run settles (done, failed or stalled) the mode's submit control
 * stays disabled and reads "Generating…". It used to be released as soon as the
 * action returned, which left the freeform button enabled and relabelled for the
 * entire run.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasAction } from '@/actions/generatePersonas'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { readStreamableValue } from '@ai-sdk/rsc'
import { batchForRun, persistPersonaBatchForRun } from '@/lib/personaRunOutcome'
import { batchLabelFromDescription } from '@/lib/resolveBatchLabel'
import {
  forgetPersonaRun,
  observePersonaRun,
  PERSONA_RUN_STALLED_MESSAGE,
  startPersonaRunPolling,
} from '@/lib/personaRunPolling'

export type PersonaProgressStep = 'BRAINSTORMING_PERSONAS' | 'GENERATING_BACKSTORIES' | 'ADDING_BEHAVIORAL_DEPTH' | 'GENERATING_INSIGHTS' | 'DONE' | 'ERROR'

export interface PersonaProgress {
  step: PersonaProgressStep
  streamingText?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  completedSubSteps?: number
  totalSubSteps?: number
  personas?: Persona[]
  error?: string
}

/** What the ICP flow exposes to the setup form. */
export interface PersonaFlowState {
  customerProfile: string
  setCustomerProfile: (value: string) => void
  personaCount: number
  setPersonaCount: (count: number) => void
  personas: Persona[] | null
  setPersonas: (personas: Persona[] | null) => void
  error: string | null
  setError: (error: string | null) => void
  /** A run is in flight, from submit until it settles. */
  isSubmitting: boolean
  personaProgress: PersonaProgress | null
  /** Batch produced by the run that finished most recently in this session. */
  lastCompletedBatchId: string | null
  /**
   * Starts a run. `promptOverride` replaces the freeform textarea's contents as
   * the generation prompt (the guided survey compiles its own). `labelSeed` is
   * the user's own words about their audience, used to name the resulting batch.
   */
  handleGeneratePersonas: (promptOverride?: string, labelSeed?: string) => void
  handleClearProgress: () => void
}

export function usePersonaFlow(onSuccess?: (personas: Persona[]) => void): PersonaFlowState {
  const router = useRouter()
  const pathname = usePathname()
  const [customerProfile, setCustomerProfile] = useState('')
  const [personaCount, setPersonaCount] = useState(5)
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [personaProgress, setPersonaProgress] = useState<PersonaProgress | null>(null)
  const [lastCompletedBatchId, setLastCompletedBatchId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  /**
   * The words the current run's batch is named from: the description the user
   * submitted, kept in a ref so both settlement paths (the local stream and the
   * remote poller) can name the batch after the same text.
   */
  const runDescriptionRef = useRef('')
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * The run is over: release the form and, when it produced a batch, put the
   * user in front of it. Two observers can settle the same run, so the id comes
   * from the batch we wrote or, if we lost that race, from the store.
   */
  const settleRun = useCallback((settledRunId: string | undefined, batch: PersonaBatch | null) => {
    if (!mountedRef.current) return
    setIsSubmitting(false)

    const settled = batch ?? (settledRunId ? batchForRun(settledRunId) : undefined)
    if (!settled) return

    // The description is ours alone: if the background toaster wrote the row
    // first, it could only give the batch a generic count label, so the batch is
    // named from the user's own words here. Label and source then agree whichever
    // observer got there first.
    if (!batch && runDescriptionRef.current) {
      const label = batchLabelFromDescription(runDescriptionRef.current, settled.label)
      if (label !== settled.label) {
        usePersonaStore.getState().updateBatchLabel(settled.id, label)
      }
    }

    setLastCompletedBatchId(settled.id)
    usePersonaStore.getState().setActiveBatch(settled.id)
    // The dashboard renders the active batch, so it is the results view for a
    // run started anywhere else in the app.
    if (pathname !== '/dashboard') router.push('/dashboard')
  }, [pathname, router])

  const handleClearProgress = useCallback(() => {
    setPersonaProgress(null)
    abortControllerRef.current = null
    setIsSubmitting(false)
  }, [])

  useEffect(() => {
    if (!runId) return

    let stopped = false
    let stop: (() => void) | null = null

    /** The run is ours no more: stop this tab's timer and drop the shared cache. */
    const finish = () => {
      stopped = true
      stop?.()
      forgetPersonaRun(runId)
    }

    const fail = (message: string) => {
      if (!mountedRef.current) return
      setError(message)
      setPersonaProgress(null)
      abortControllerRef.current = null
      setIsSubmitting(false)
    }

    // The toaster and /dashboard/generating/<runId> watch the same run, so the
    // cadence, the single-flight fetch and the stall verdict come from
    // `@/lib/personaRunPolling`; three surfaces on three private timers was the
    // 2.7 POSTs/second storm the audit found. This effect renders observations.
    stop = startPersonaRunPolling(async () => {
      if (stopped || !mountedRef.current) return
      const observation = await observePersonaRun(runId)
      if (stopped || !mountedRef.current) return

      if (observation.result) {
        finish()
        if (observation.result.error) {
          fail(observation.result.error)
          return
        }
        const finished = observation.result.personas ?? []
        if (finished.length === 0) {
          fail('Persona generation finished without any personas. Please try again.')
          return
        }

        // Don't removeActiveGeneration here — the background toaster
        // (PersonaProgressToaster) detects completion independently and
        // owns cleanup. The runId stays in activeGenerationRunIds until
        // the toast is dismissed or the user explicitly cancels.
        const batch = await persistPersonaBatchForRun({
          runId,
          personas: finished,
          source: 'description',
          description: runDescriptionRef.current,
          fallbackLabel: 'Generated personas',
        })
        if (mountedRef.current) {
          setPersonas(finished)
          setPersonaProgress({ step: 'DONE', personas: finished, completedCount: finished.length, totalCount: finished.length })
          abortControllerRef.current = null
        }
        settleRun(runId, batch)
        if (onSuccess) onSuccess(finished)
        return
      }

      // A run the pipeline stopped reporting: one terminal message, no spinner
      // left behind, and the same words the app-wide toast uses.
      if (observation.stalled) {
        finish()
        fail(PERSONA_RUN_STALLED_MESSAGE)
        return
      }

      if (observation.progress) {
        setPersonaProgress({
          step: (observation.progress.step as PersonaProgressStep) || 'BRAINSTORMING_PERSONAS',
          streamingText: observation.progress.streamingText,
          personaName: observation.progress.personaName,
          completedCount: observation.progress.completedCount ?? observation.progress.completedResponses,
          totalCount: observation.progress.totalCount ?? observation.progress.totalResponses,
        })
      }
    })

    return () => {
      stopped = true
      stop?.()
    }
  }, [runId, onSuccess, settleRun])

  const handleGeneratePersonas = useCallback((promptOverride?: string, labelSeed?: string) => {
    const prompt = promptOverride ?? customerProfile
    if (!prompt.trim()) return

    // The run is named from the user's own words about their audience when the
    // caller has them (the guided survey), otherwise from the prompt itself.
    runDescriptionRef.current = (labelSeed?.trim() || prompt).trim()

    setError(null)
    setRunId(null)
    setLastCompletedBatchId(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })
    setIsSubmitting(true)

    ;(async () => {
      try {
        // The ICP flow always generates strategy-mode personas — rich
        // storytelling built on representative assumptions.
        const result = await generatePersonasAction(prompt, personaCount, 'strategy')
        const streamData = result.streamData
        const id = result.runId

        if (id) {
          usePersonaStore.getState().addActiveGeneration(id)
        }

        if (streamData) {
          for await (const update of readStreamableValue(streamData)) {
            if (!update) continue

            if (update.step === 'ERROR') {
              if (mountedRef.current) {
                setError(update.error)
                setPersonaProgress(null)
                abortControllerRef.current = null
                setIsSubmitting(false)
              }
              return
            }

            if (update.step === 'DONE') {
              const batch = await persistPersonaBatchForRun({
                runId: id,
                personas: update.personas,
                source: 'description',
                description: runDescriptionRef.current,
                fallbackLabel: 'Generated personas',
              })
              if (mountedRef.current && update.personas) {
                setPersonas(update.personas)
                setPersonaProgress({ step: 'DONE', personas: update.personas, completedCount: update.personas.length, totalCount: update.personas.length })
                abortControllerRef.current = null
              }
              settleRun(id, batch)
              if (update.personas && onSuccess) onSuccess(update.personas)
              return
            }

            if (mountedRef.current) {
              setPersonaProgress(update)
            }
          }
        } else if (id) {
          setRunId(id)
        }
      } catch (err) {
        if (mountedRef.current && !controller.signal.aborted) {
          setError((err as Error).message)
          setPersonaProgress(null)
          abortControllerRef.current = null
          setIsSubmitting(false)
        }
      }
    })()
  }, [customerProfile, personaCount, onSuccess, settleRun])

  return {
    customerProfile,
    setCustomerProfile,
    personaCount,
    setPersonaCount,
    personas,
    setPersonas,
    error,
    setError,
    isSubmitting,
    personaProgress,
    lastCompletedBatchId,
    handleGeneratePersonas,
    handleClearProgress,
  }
}
