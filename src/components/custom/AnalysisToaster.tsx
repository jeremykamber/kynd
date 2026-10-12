'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { getProgressAction } from '@/actions/getProgress'
import { getAnalysisResultAction } from '@/actions/getAnalysisResult'
import { ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon } from 'lucide-react'
import type { ArtifactAnalysis, AnalysisProgressStep, AnalysisStatus } from '@/domain/entities/ArtifactAnalysis'
import { summarizeError } from '@/lib/errorSummary'

/**
 * Module-level toast map — survives component remounts so existing toasts are
 * never orphaned when React re-renders the tree (e.g. suspense, nav). The
 * recorded status is what lets a remount reconcile a stale toast with the
 * store instead of leaving it on screen.
 */
const toastIdMap = new Map<string, { id: string | number; status: AnalysisStatus }>()

/** The action a toast offers per run status. */
const TOAST_ACTION_LABEL: Record<AnalysisStatus, string | undefined> = {
  IN_PROGRESS: 'View',
  COMPLETED: 'View Results',
  ERROR: 'Details',
  CANCELLED: undefined,
}

/** What the pipeline records for a run that was stopped from the outside. */
const CANCELLED_MESSAGE = 'Request was cancelled'

/**
 * The steps a run reports, as a lookup rather than a cast: the server sends a
 * plain string, and only these are steps the store accepts.
 */
const PROGRESS_STEP_BY_NAME: Record<string, AnalysisProgressStep> = {
  STARTING: 'STARTING',
  INTAKE: 'INTAKE',
  ANALYZING: 'ANALYZING',
  DONE: 'DONE',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
}

function AnalysisToastContent({
  analysis,
  onView,
  onDismiss,
  actionLabel,
}: {
  analysis: ArtifactAnalysis
  onView: () => void
  onDismiss: () => void
  actionLabel?: string
}) {
  const completed = analysis.completedResponses ?? 0
  const total = analysis.totalResponses ?? 0
  const progress = total > 0 ? Math.min(completed / total, 1) : 0
  const isTerminal = analysis.status !== 'IN_PROGRESS'

  const statusConfig = {
    IN_PROGRESS: {
      icon: <ClockIcon className="h-4 w-4 shrink-0 text-primary animate-spin" />,
      label: analysis.completedResponses != null && analysis.totalResponses != null
        ? `${analysis.completedResponses}/${analysis.totalResponses} analyses`
        : 'Analyzing...',
      labelClass: analysis.completedResponses != null && analysis.totalResponses != null
        ? 'text-xs font-mono tabular-nums text-muted-foreground'
        : 'text-sm text-muted-foreground',
      accentClass: 'bg-primary/[0.06]',
      ringClass: 'ring-primary/20',
      progressWidth: `${progress * 100}%`,
      buttonClass: 'text-primary hover:text-primary/80',
    },
    COMPLETED: {
      icon: <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />,
      label: 'Analysis complete',
      labelClass: 'text-sm text-muted-foreground',
      accentClass: 'bg-green-500/[0.06]',
      ringClass: 'ring-green-500/20',
      progressWidth: '100%',
      buttonClass: 'text-green-600 hover:text-green-700',
    },
    ERROR: {
      icon: <XCircleIcon className="h-4 w-4 shrink-0 text-destructive" />,
      label: summarizeError(analysis.error || 'Analysis failed'),
      labelClass: 'text-sm text-muted-foreground',
      accentClass: 'bg-destructive/[0.06]',
      ringClass: 'ring-destructive/20',
      progressWidth: '100%',
      buttonClass: 'text-destructive hover:text-destructive/80',
    },
    CANCELLED: {
      icon: <AlertCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />,
      label: 'Analysis cancelled',
      labelClass: 'text-sm text-muted-foreground',
      accentClass: 'bg-muted/30',
      ringClass: 'ring-muted-foreground/20',
      progressWidth: '100%',
      buttonClass: 'text-muted-foreground hover:text-foreground',
    },
  }[analysis.status]

  return (
    <div className="relative group overflow-hidden rounded-lg border border-border bg-card">
      {analysis.status === 'IN_PROGRESS' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[analysis-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className={`absolute inset-y-0 left-0 ${statusConfig.accentClass} transition-all duration-300 ease-out`}
        style={{ width: statusConfig.progressWidth }}
      />
      <div className="relative z-10 flex items-center gap-4 p-5">
        {statusConfig.icon}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <p className="truncate text-base font-semibold text-foreground leading-snug">{analysis.name}</p>
          <p className={statusConfig.labelClass}>{statusConfig.label}</p>
        </div>
        {actionLabel && (
          <button
            onClick={onView}
            className={`shrink-0 text-sm font-semibold underline underline-offset-4 transition-colors ${statusConfig.buttonClass}`}
          >
            {actionLabel}
          </button>
        )}
        {isTerminal && (
          <button
            onClick={onDismiss}
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Dismiss"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Parse a snapshot string into a map of analysis IDs to their statuses.
 * Snapshot format: "id1:STATUS1:c/t|id2:STATUS2:c/t|..."
 */
function parseSnapshotStatuses(snapshot: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!snapshot) return map
  for (const part of snapshot.split('|')) {
    const [id, status] = part.split(':')
    if (id && status) map.set(id, status)
  }
  return map
}

/**
 * App-wide toast surface for artifact analyses, mounted in the root layout.
 *
 * Owns one sonner toast per analysis, and is the app's only progress poller: it
 * reads every in-flight run from the server and writes step counts, terminal
 * states and the results they settle on back into `useAnalysisStore`. That
 * makes the store the single place a run's progress lands, so a reloaded page
 * (or any other view of the same run) resumes live progress rather than showing
 * a frozen bar. Renders nothing.
 */
export function AnalysisToaster() {
  const lastSnapshotRef = useRef<string>('')

  const snapshot = useAnalysisStore(
    (s) =>
      s.analyses
        .map(
          (a) =>
            `${a.id}:${a.status}:${a.completedResponses ?? 0}/${a.totalResponses ?? 0}`,
        )
        .join('|'),
  )

  const persistDismiss = (id: string) => {
    toastIdMap.delete(id)
    useAnalysisStore.getState().dismissAnalysis(id)
  }

  // Every analysis the user should see is announced once, and every toast
  // follows the store from then on: as long as the run is in flight the toast
  // lives on (it is where that progress is announced), and the moment the store
  // reports a terminal status that toast is dropped and replaced by a
  // self-dismissing one. So a finished run can never leave a spinner behind,
  // however late this component notices (mount, remount or a poll landing).
  useEffect(() => {
    // IDs that were already terminal in the previous snapshot: they have had
    // their toast, so they must not flash back as new ones. This is also what
    // keeps terminal analyses hydrated from Zustand persist from announcing
    // themselves on mount.
    const prevStatuses = parseSnapshotStatuses(lastSnapshotRef.current)
    const prevTerminal = new Set<string>()
    for (const [id, status] of prevStatuses) {
      if (status !== 'IN_PROGRESS') prevTerminal.add(id)
    }

    const isFirstRun = lastSnapshotRef.current === ''
    if (!isFirstRun && snapshot === lastSnapshotRef.current) return
    lastSnapshotRef.current = snapshot

    const { analyses, dismissedAnalysisIds } = useAnalysisStore.getState()

    for (const analysis of analyses) {
      const existing = toastIdMap.get(analysis.id)

      if (dismissedAnalysisIds.includes(analysis.id)) {
        if (existing) {
          toast.dismiss(existing.id)
          toastIdMap.delete(analysis.id)
        }
        continue
      }

      // A status change is a new notification: drop the previous toast so the
      // replacement is created with its own lifetime (an in-flight toast never
      // expires, a settled one does).
      if (existing && existing.status !== analysis.status) {
        toast.dismiss(existing.id)
        toastIdMap.delete(analysis.id)
      }

      const content = (
        <AnalysisToastContent
          analysis={analysis}
          onView={() => { window.location.href = `/dashboard/analyses/${analysis.id}` }}
          onDismiss={() => persistDismiss(analysis.id)}
          actionLabel={TOAST_ACTION_LABEL[analysis.status]}
        />
      )

      const current = toastIdMap.get(analysis.id)
      if (current) {
        toast.custom(() => content, { id: current.id })
        continue
      }

      if (prevTerminal.has(analysis.id)) continue
      // On the first run nothing has transitioned; only a live run earns a
      // toast, so a page load never replays settled history.
      if (isFirstRun && analysis.status !== 'IN_PROGRESS') continue

      const id = toast.custom(() => content, {
        dismissible: true,
        onDismiss: () => persistDismiss(analysis.id),
        ...(analysis.status === 'IN_PROGRESS' ? { duration: Infinity } : {}),
      })
      toastIdMap.set(analysis.id, { id, status: analysis.status })
    }
  }, [snapshot])

  // The one progress poller in the app — runs on every page since this
  // component is mounted in the root layout, and survives a reload, unlike the
  // page that started the run. It bridges server-side progress (from the VPS
  // analysis IIFE, or a local run whose RSC stream the user navigated away
  // from) into the Zustand store, which is therefore the only place a run's
  // progress lives: the toast, the list card and the detail page all read it
  // back. The first tick runs immediately so a reloaded page resumes live
  // progress without waiting out an interval.
  useEffect(() => {
    const pollInFlightRuns = async () => {
      const analyses = useAnalysisStore.getState().analyses
      const inProgress = analyses.filter((a) => a.status === 'IN_PROGRESS')
      if (inProgress.length === 0) return

      for (const analysis of inProgress) {
        try {
          // The stored result is the authority on whether a run is over: a run
          // can be settled server-side — cancelled, failed, or finished while
          // another tab owned it — while the record still reads in-flight.
          // Asking first is what stops a stale record from spinning forever.
          const result = await getAnalysisResultAction(analysis.id)
          if (result.found) {
            if (result.error) {
              if (result.error === CANCELLED_MESSAGE) {
                useAnalysisStore.getState().markCancelled(analysis.id)
              } else {
                useAnalysisStore.getState().markError(analysis.id, result.error)
              }
            } else if (result.analyses && result.analyses.length > 0) {
              useAnalysisStore.getState().markComplete(analysis.id, result.analyses, result.synthesis)
            } else {
              // Settled with no responses and no error — keep it out of flight
              useAnalysisStore.getState().markError(analysis.id, 'Analysis completed with no results')
            }
            continue
          }

          const progress = await getProgressAction(analysis.id)
          if (!progress.found || !progress.progress) continue

          const p = progress.progress
          const updates: Partial<ArtifactAnalysis> = {}
          const step = PROGRESS_STEP_BY_NAME[p.step ?? '']
          if (step) updates.currentStep = step
          // Both field namings are accepted: local runs store
          // completedResponses/totalResponses, the VPS reports counts.
          const completed = p.completedResponses ?? p.completedCount
          if (completed !== undefined) updates.completedResponses = completed
          const total = p.totalResponses ?? p.totalCount
          if (total !== undefined) updates.totalResponses = total

          if (Object.keys(updates).length > 0) {
            useAnalysisStore.getState().updateAnalysis(analysis.id, updates)
          }

          if (p.error) {
            useAnalysisStore.getState().markError(analysis.id, p.error)
          }
        } catch {
          // Poller error — retry on next interval
        }
      }
    }

    void pollInFlightRuns()
    const interval = setInterval(() => { void pollInFlightRuns() }, 3000)

    return () => clearInterval(interval)
  }, [])

  return null
}
