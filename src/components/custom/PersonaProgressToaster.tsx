'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { ClockIcon, CheckCircleIcon, XCircleIcon, XIcon } from 'lucide-react'
import { usePersonaStore } from '@/ui/stores/personaStore'
import type { ProgressState } from '@/actions/getProgress'
import { cancelRequestAction } from '@/actions/cancelRequest'
import {
  persistPersonaBatchForRun,
  recordFailedPersonaBatch,
  sourceOf,
} from '@/lib/personaRunOutcome'
import { personaRunProgress } from '@/ui/dashboard/utils/personaRunProgress'
import {
  PERSONA_RUN_STALLED_MESSAGE,
  forgetPersonaRun,
  observePersonaRun,
  personaRunToastId,
  runStartedAt,
  runStatusText,
  startPersonaRunPolling,
  type PersonaRunObservation,
} from '@/lib/personaRunPolling'
import {
  canRetryInterviewRun,
  forgetInterviewRunInput,
  retryInterviewRun,
} from '@/lib/personaRunSubmission'

/**
 * Failure reasons (e.g. a rejected verbatim-evidence batch) can be many KB
 * long. The toast shows a preview; the full error lives on the generating
 * page (/dashboard/generating/<runId>).
 */
const ERROR_PREVIEW_CHARS = 200
function truncateError(message: string): string {
  if (message.length <= ERROR_PREVIEW_CHARS) return message
  return `${message.slice(0, ERROR_PREVIEW_CHARS)}…`
}

/**
 * Runs this toaster has finished with: settled (completed, failed or stalled),
 * cancelled, or dismissed by the user. A settled run leaves the store's active
 * list and its cached polls are dropped, so it costs nothing and can never be
 * reported twice.
 */
const settledRuns = new Set<string>()

/**
 * When each run was first seen, for the toast's elapsed clock. It is the
 * fallback for run ids that carry no start time — see `runStartedAt`.
 */
const seenRuns = new Map<string, number>()

/**
 * Stops watching a run: it leaves the active list, its polls are dropped and
 * it can never be settled twice. The run's inputs stay remembered, because a
 * terminal toast may still offer Retry.
 */
function settleRun(runId: string): void {
  settledRuns.add(runId)
  seenRuns.delete(runId)
  usePersonaStore.getState().removeActiveGeneration(runId)
  forgetPersonaRun(runId)
}

/** Settles a run and takes its toast down — nothing can Retry it any more. */
function dismissRun(runId: string): void {
  settleRun(runId)
  forgetInterviewRunInput(runId)
}

/**
 * Renders one toast per run, whatever number of observers are running.
 *
 * A status toast is informational: the card itself never takes a click that
 * belongs to the page underneath it (sonner's stack and our card are
 * click-through), so a toast can sit above a control without disabling it. Its
 * controls — Cancel, Retry, View — opt back into pointer events.
 */
function showRunToast(runId: string, content: React.ReactElement, duration: number): void {
  toast.custom(() => content, {
    id: personaRunToastId(runId),
    dismissible: true,
    onDismiss: () => dismissRun(runId),
    duration,
    className: 'pointer-events-none',
    style: { pointerEvents: 'none' },
  })
}

/** `1 Persona from Interviews`, `4 Personas from Interviews`. */
function batchCountLabel(source: 'description' | 'interviews', count: number): string {
  const personas = `${count} Persona${count === 1 ? '' : 's'}`
  return source === 'interviews' ? `${personas} from Interviews` : `${personas} Generated`
}

function completedToast(runId: string, personaCount: number): React.ReactElement {
  return (
    <PersonaToastContent
      title={`${personaCount} Persona${personaCount === 1 ? '' : 's'} Ready`}
      progress={1}
      onView={() => {
        window.location.href = '/dashboard'
      }}
      onDismiss={() => dismissRun(runId)}
      variant="completed"
    />
  )
}

function failedToast(runId: string, title: string, message: string): React.ReactElement {
  return (
    <PersonaToastContent
      title={title}
      subtext={truncateError(message)}
      progress={1}
      onRetry={canRetryInterviewRun(runId) ? () => retryRun(runId) : undefined}
      onView={() => {
        // The generating page carries the full error; the toast only shows a
        // preview.
        window.location.href = `/dashboard/generating/${runId}`
      }}
      onDismiss={() => dismissRun(runId)}
      variant="error"
    />
  )
}

/**
 * Submits a failed run's inputs again. The run's own id is spent, so the retry
 * is a new run with a new toast; this one is dismissed so the two never sit on
 * screen together, and the retry's inputs are released from the memory that
 * made it possible.
 */
function retryRun(runId: string): void {
  void retryInterviewRun(runId)
    .then((retryRunId) => {
      if (!retryRunId) return
      toast.dismiss(personaRunToastId(runId))
      forgetInterviewRunInput(runId)
    })
    .catch((error) => {
      console.error('[persona-run] retry failed to start', error)
    })
}

/**
 * Stops an in-progress run. The server is asked first — it can only stop runs
 * it registered as cancellable — and either way the run leaves the tracker:
 * the user asked to stop watching it, and a run the backend will not stop is
 * one nothing will ever report on.
 */
function cancelRun(runId: string): void {
  void cancelRequestAction(runId)
    .then((result) => {
      if (!result.success) {
        console.warn(`[persona-run] backend did not stop ${runId}: ${result.message}`)
      }
    })
    .catch((error) => {
      console.error('[persona-run] cancel request failed', error)
    })
    .finally(() => {
      dismissRun(runId)
      toast.dismiss(personaRunToastId(runId))
    })
}

/** `1:32` — minutes and seconds, for the toast's clock. */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/**
 * The run's numbers, in the Caption role: percentage, elapsed, and — once the
 * bar is far enough along for the estimate to mean anything — the time left.
 */
function formatRunMeta(percent: number, elapsedMs: number): string {
  const parts = [`${Math.round(percent * 100)}%`, `${formatClock(elapsedMs)} elapsed`]
  if (percent >= 0.05 && percent < 1) {
    parts.push(`~${formatClock((elapsedMs * (1 - percent)) / percent)} left`)
  }
  return parts.join(' · ')
}

async function settleFromResult(
  runId: string,
  result: NonNullable<PersonaRunObservation['result']>,
): Promise<void> {
  const personas = result.personas ?? []
  const error = result.error

  settleRun(runId)

  // The user stopped the run: terminal, and deliberately empty-handed. It is
  // not a failure, so no failed batch is written — the toast of the tab that
  // cancelled is already gone, but another observer of the same run has to
  // reach the same verdict.
  if (result.cancelled) {
    showRunToast(
      runId,
      <PersonaToastContent
        title="Generation Cancelled"
        subtext="You stopped this run."
        progress={0}
        variant="cancelled"
        onView={() => {
          window.location.href = '/dashboard/interviews'
        }}
        onDismiss={() => dismissRun(runId)}
      />,
      8000,
    )
    return
  }

  if (error || personas.length === 0) {
    const message = error ?? PERSONA_RUN_STALLED_MESSAGE
    recordFailedPersonaBatch(runId, message)
    showRunToast(runId, failedToast(runId, 'Generation Failed', message), 8000)
    return
  }

  const source = sourceOf(runId)
  await persistPersonaBatchForRun({
    runId,
    personas,
    source,
    fallbackLabel: batchCountLabel(source, personas.length),
  })
  showRunToast(runId, completedToast(runId, personas.length), 8000)
}

/**
 * A run the progress store reports as failed. The progress store keeps failures
 * (the result store expires after 30 minutes), so a poll that only ever sees
 * progress must still settle the run in the error state — and leaves the batch
 * record behind on the way out.
 */
function settleFromProgressError(runId: string, error: string): void {
  settleRun(runId)
  recordFailedPersonaBatch(runId, error)
  showRunToast(runId, failedToast(runId, 'Generation Failed', error), 8000)
}

/**
 * A run that stopped reporting. This is the terminal state the audit found
 * missing: before it, a hung run polled forever with no error, no timeout and
 * no way for the user to stop it.
 */
function settleFromStall(runId: string): void {
  settleRun(runId)
  recordFailedPersonaBatch(runId, PERSONA_RUN_STALLED_MESSAGE)
  showRunToast(runId, failedToast(runId, 'Generation Stalled', PERSONA_RUN_STALLED_MESSAGE), 8000)
}

function renderInProgress(runId: string, progress?: ProgressState): void {
  // The run's own start time when its id carries one, so the clock is right on
  // first sight and after a reload; otherwise when a surface first saw it.
  const seenAt = seenRuns.get(runId) ?? runStartedAt(runId) ?? Date.now()
  seenRuns.set(runId, seenAt)

  // The same helper the progress page renders, so the toast's bar, its
  // percentage and the page's bar are one number.
  const percent = personaRunProgress(
    progress?.step,
    progress?.completedCount ?? progress?.completedResponses,
    progress?.totalCount ?? progress?.totalResponses,
  )

  showRunToast(
    runId,
    <PersonaToastContent
      title="Generating personas"
      // A transient retry is not user-facing state; runStatusText logs it and
      // returns the step's neutral label.
      subtext={runStatusText(progress)}
      progress={percent}
      meta={formatRunMeta(percent, Date.now() - seenAt)}
      onCancel={() => cancelRun(runId)}
      onView={() => {
        window.location.href = `/dashboard/generating/${runId}`
      }}
    />,
    Infinity,
  )
}

async function observeRun(runId: string): Promise<void> {
  const observation = await observePersonaRun(runId)
  // A concurrent poll may have settled the run while this one was awaiting —
  // never overwrite its terminal toast with a stale in-progress render.
  if (settledRuns.has(runId)) return

  if (observation.result) return settleFromResult(runId, observation.result)
  if (observation.progress?.error) return settleFromProgressError(runId, observation.progress.error)
  if (observation.stalled) return settleFromStall(runId)

  renderInProgress(runId, observation.progress)
}

/**
 * App-wide toast surface for persona-generation runs, mounted in the root
 * layout. It observes runs rather than owning them: a run that finishes while
 * the user is on another page still has to reach the batch list, so the outcome
 * is handed to `persistPersonaBatchForRun`, the same call the starting hook
 * makes. Either may arrive first, and only one of them writes the batch.
 *
 * One cadence, one timer, one round trip per run per cadence — see
 * `@/lib/personaRunPolling` for why that is the whole point.
 */
export function PersonaProgressToaster() {
  const activeRunCount = usePersonaStore((s) => s.activeGenerationRunIds.length)

  useEffect(() => {
    if (activeRunCount === 0) return

    return startPersonaRunPolling(async () => {
      // Read the store per tick: runs started or cancelled while the poller is
      // alive are picked up without restarting it.
      for (const runId of usePersonaStore.getState().activeGenerationRunIds) {
        if (settledRuns.has(runId)) continue
        await observeRun(runId)
      }
    })
  }, [activeRunCount])

  return null
}

/**
 * What a persona toast renders. Exported because the toast is handed to sonner
 * as an element, so this is the only typed description of what a toast carries.
 */
export interface PersonaToastContentProps {
  title: string
  subtext?: string
  /** 0–1, the same number the progress page's bar uses. */
  progress: number
  /** Caption line: percentage, elapsed clock, time left. */
  meta?: string
  onView: () => void
  onDismiss?: () => void
  onCancel?: () => void
  onRetry?: () => void
  variant?: 'in-progress' | 'completed' | 'cancelled' | 'error'
}

function PersonaToastContent({
  title,
  subtext,
  progress,
  meta,
  onView,
  onDismiss,
  onCancel,
  onRetry,
  variant = 'in-progress',
}: PersonaToastContentProps) {
  const Icon =
    variant === 'completed'
      ? CheckCircleIcon
      : variant === 'error'
        ? XCircleIcon
        : ClockIcon

  const iconClass =
    variant === 'completed'
      ? 'text-green-500'
      : variant === 'error'
        ? 'text-destructive'
        : variant === 'cancelled'
          ? 'text-muted-foreground'
          : 'text-primary animate-spin'

  const label = variant === 'completed' ? 'View Batch' : 'View'
  const isTerminal = variant !== 'in-progress'

  // The only parts of the toast that take clicks; everything else passes
  // through to the page (see showRunToast).
  const actionClass =
    'pointer-events-auto shrink-0 text-sm font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80'

  return (
    <div className="pointer-events-none relative w-full min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      {variant === 'in-progress' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[analysis-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className="absolute inset-y-0 left-0 bg-primary/[0.06] transition-all duration-300 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
      <div className="relative z-10 flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} />
          <div className="min-w-0 flex-1">
            {/* No truncation: the message wraps instead of being cut off. */}
            <p className="text-base font-semibold leading-snug text-foreground">{title}</p>
            {subtext && (
              <p className="mt-1 break-words text-sm leading-snug text-muted-foreground">{subtext}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 pl-7">
          {/* The numbers own this line: sharing it with the actions is what
              clipped the elapsed clock and the estimate in the audit's toast. */}
          {meta && (
            <p className="text-xs font-mono tabular-nums text-muted-foreground">{meta}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {onCancel && (
              <button type="button" onClick={onCancel} className={actionClass}>
                Cancel
              </button>
            )}
            {onRetry && (
              <button type="button" onClick={onRetry} className={actionClass}>
                Retry
              </button>
            )}
            <button type="button" onClick={onView} className={actionClass}>
              {label}
            </button>
            {isTerminal && onDismiss && (
              <button
                onClick={onDismiss}
                className="pointer-events-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Dismiss"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
