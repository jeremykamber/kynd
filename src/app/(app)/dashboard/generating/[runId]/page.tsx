'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircleIcon, XCircleIcon, ArrowLeftIcon } from 'lucide-react'
import { StepIndicator } from '@/components/custom/StepIndicator'
import { FeedbackButton } from '@/components/custom/FeedbackButton'
import { Progress } from '@/components/ui/progress'
import type { PersonaGenerationResult } from '@/actions/getPersonaGenerationResult'
import { personaRunProgress } from '@/ui/dashboard/utils/personaRunProgress'
import {
  PERSONA_RUN_STALLED_MESSAGE,
  observePersonaRun,
  runStatusText,
  startPersonaRunPolling,
} from '@/lib/personaRunPolling'
import { canRetryInterviewRun, retryInterviewRun } from '@/lib/personaRunSubmission'

type FlowStep = { title: string; description?: string }

const PERSONA_STEPS: FlowStep[] = [
  { title: 'Analyzing Market', description: 'Mapping demographics and psychographics' },
  { title: 'Generating Personas', description: 'Creating detailed backstories and traits' },
  { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality traits' },
  { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
]

const PIPELINE_STEPS: FlowStep[] = [
  { title: 'Extracting Signals', description: 'Analyzing interview transcripts for behavioral signals' },
  { title: 'Pooling Signals', description: 'Aggregating patterns across all interviews' },
  { title: 'Sampling Personas', description: 'Drawing coherent persona profiles from the distribution' },
  { title: 'Generating Personas', description: 'Building backstories, psychographics, and insights' },
  { title: 'Ingesting to Memory', description: 'Indexing personas for retrieval-augmented chat' },
]

function detectFlowType(runId: string): 'persona' | 'pipeline' | 'unknown' {
  if (runId.startsWith('pipeline-') || runId.startsWith('pi-')) return 'pipeline'
  if (runId.startsWith('persona-') || runId.startsWith('pt-')) return 'persona'
  return 'unknown'
}

function stepToIndex(step: string | undefined, steps: FlowStep[]): number {
  if (!step) return 0
  if (steps.length === 5) {
    // Pipeline steps
    if (step === 'UPLOADING' || step === 'EXTRACTING' || step === 'EXTRACTING_SIGNALS') return 0
    if (step === 'POOLING' || step === 'POOLING_SIGNALS') return 1
    if (step === 'SAMPLING' || step === 'SAMPLING_PERSONAS') return 2
    if (step === 'GENERATING' || step === 'GENERATING_PERSONAS') return 3
    if (step === 'INGESTING' || step === 'INGESTING_TO_MEMORY') return 4
    return 0
  }
  // Persona steps
  if (step === 'BRAINSTORMING_PERSONAS') return 0
  if (step === 'GENERATING_BACKSTORIES') return 1
  if (step === 'ADDING_BEHAVIORAL_DEPTH') return 2
  if (step === 'GENERATING_INSIGHTS') return 2
  if (step === 'DONE') return 3
  return 0
}

/**
 * /dashboard/generating/[runId]: progress screen for a background persona run.
 * The runId prefix ("persona-" / "pipeline-") selects which pipeline's step
 * labels apply.
 *
 * Progress comes through the shared cadence and fetch gate in
 * `@/lib/personaRunPolling`, which is also where the verdict on a run that
 * stopped reporting comes from — so this page and the toast that reported the
 * same run can never tell the user two different stories.
 */
export default function GeneratingPage() {
  const params = useParams()
  const router = useRouter()
  const runId = params.runId as string
  const flowType = detectFlowType(runId)
  const steps = flowType === 'pipeline' ? PIPELINE_STEPS : PERSONA_STEPS
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState<number>(0)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [personaName, setPersonaName] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState<number | undefined>(undefined)
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined)
  const [result, setResult] = useState<PersonaGenerationResult | null>(null)
  const [stalled, setStalled] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!runId) return

    return startPersonaRunPolling(async () => {
      const observation = await observePersonaRun(runId)
      if (!mountedRef.current) return

      if (observation.result) {
        setResult(observation.result)
        return
      }

      setStalled(observation.stalled)

      const state = observation.progress
      if (!state) return

      setCurrentStep(stepToIndex(state.step, steps))
      // A transient retry is internal; runStatusText logs it and returns the
      // step's neutral label.
      setStreamingText(state.streamingText?.trim() ? runStatusText(state) : null)
      setPersonaName(state.personaName ?? null)

      const completed = state.completedCount ?? state.completedResponses
      const total = state.totalCount ?? state.totalResponses
      setCompletedCount(completed)
      setTotalCount(total)

      // Same helper the toast uses, so the two bars always agree.
      setProgress(personaRunProgress(state.step, completed, total) * 100)
    })
  }, [runId, steps])

  // A run can only be retried while the inputs that made it are still known.
  const retryable = canRetryInterviewRun(runId)

  const handleRetry = () => {
    void retryInterviewRun(runId)
      .then((retryRunId) => {
        if (retryRunId) router.replace(`/dashboard/generating/${retryRunId}`)
      })
      .catch((error) => {
        console.error('[generating] retry failed to start', error)
      })
  }

  const failure = result?.error ?? (stalled ? PERSONA_RUN_STALLED_MESSAGE : null)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" />
        Back to Dashboard
      </button>

      {failure ? (
        <div className="rounded-xl border border-border bg-card p-8 md:p-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <XCircleIcon className="h-12 w-12 text-destructive" />
            <h1 className="text-3xl font-semibold tracking-tight">Generation Failed</h1>
            <p className="text-base leading-relaxed text-muted-foreground max-w-md">{failure}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {retryable && (
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              )}
              {result?.error && (
                <FeedbackButton
                  label="Report this error"
                  defaultMessage={result.error}
                  context={{ error: result.error, runId }}
                  variant="outline"
                />
              )}
            </div>
          </div>
        </div>
      ) : result ? (
        <div className="rounded-xl border border-border bg-card p-8 md:p-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircleIcon className="h-12 w-12 text-green-500" />
            <h1 className="text-3xl font-semibold tracking-tight">
              {result.personas?.length ?? 0} Personas Ready
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Your personas have been generated and added to the dashboard.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors mt-2"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              View on Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-8 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-semibold tracking-tight min-w-0">
                {flowType === 'pipeline' ? 'Processing Interview Transcripts' : 'Synthesizing Personas'}
              </h1>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-8 px-4 sm:px-8 py-6">
            <div className="flex-shrink-0 w-full md:w-56">
              <StepIndicator steps={steps} currentStep={currentStep} />
            </div>
            <div className="flex-1 min-h-50 flex flex-col justify-center items-center">
              {streamingText && (
                <div className="mb-6 text-center">
                  <p className="text-base leading-relaxed text-muted-foreground">{streamingText}</p>
                  {personaName && (
                    <p className="mt-1.5 text-xs font-mono text-muted-foreground">
                      ↳ persona: {personaName}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col items-center justify-center w-full max-w-xs mx-auto space-y-4">
                <Progress value={Math.max(progress, 10)} className="h-2 w-full" />
                {completedCount !== undefined && totalCount !== undefined && (
                  <p className="text-xs font-mono text-muted-foreground tabular-nums">
                    {completedCount}/{totalCount}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
