'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ClockIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { getProgressAction } from '@/actions/getProgress'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { usePathname } from 'next/navigation'

const POLL_INTERVAL_MS = 1000

/**
 * Background toaster that polls active persona generation runIds and surfaces
 * progress/completion/errors as Sonner toasts.
 *
 * Polls every 2s while any runs are active (unlike SimulationToaster which
 * relies on the store snapshot changing — persona progress updates within a
 * single runId don't trigger snapshot changes, so interval polling is needed).
 */
export function PersonaProgressToaster() {
  const pathname = usePathname()
  const activeRunIds = usePersonaStore((s) => s.activeGenerationRunIds)
  const removedRef = useRef<Set<string>>(new Set())
  const toastIdsRef = useRef<Map<string, string | number>>(new Map())
  const lastCompletionRef = useRef<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const persistDismiss = (runId: string) => {
    removedRef.current.add(runId)
    toastIdsRef.current.delete(runId)
    usePersonaStore.getState().removeActiveGeneration(runId)
  }

  // ── Interval-based polling: runs every 2s while runs are active ──
  useEffect(() => {
      if (activeRunIds.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const poll = async () => {
      const runIds = usePersonaStore.getState().activeGenerationRunIds
      if (runIds.length === 0) return

      for (const runId of runIds) {
        if (removedRef.current.has(runId)) continue

        const existingToastId = toastIdsRef.current.get(runId)

        // 1. Check for a final result (completed/error)
        const result = await getPersonaGenerationResultAction(runId)

        if (result.found) {
          if (lastCompletionRef.current.has(runId)) continue

          lastCompletionRef.current.add(runId)
          removedRef.current.add(runId) // stop further polling for this run

          if (result.error) {
            if (existingToastId) {
              toast.error('Generation Failed', {
                id: existingToastId,
                description: result.error,
                icon: <XCircleIcon className="h-4 w-4 text-destructive" />,
                dismissible: true,
                onDismiss: () => persistDismiss(runId),
              })
            } else {
              const id = toast.error('Generation Failed', {
                description: result.error,
                icon: <XCircleIcon className="h-4 w-4 text-destructive" />,
                dismissible: true,
                onDismiss: () => persistDismiss(runId),
              })
              toastIdsRef.current.set(runId, id)
            }
            continue
          }

          const personaCount = result.personas?.length ?? 0

          if (existingToastId) {
            toast.success(`${personaCount} Personas Ready`, {
              id: existingToastId,
              icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
              dismissible: true,
              onDismiss: () => persistDismiss(runId),
              action: {
                label: 'View Batch',
                onClick: () => {
                  window.location.href = '/dashboard'
                },
              },
            })
          } else {
            const id = toast.success(`${personaCount} Personas Ready`, {
              icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
              dismissible: true,
              onDismiss: () => persistDismiss(runId),
              action: {
                label: 'View Batch',
                onClick: () => {
                  window.location.href = '/dashboard'
                },
              },
            })
            toastIdsRef.current.set(runId, id)
          }
          continue
        }

        // 2. Still in progress — poll progress details and update toast
        const p = await getProgressAction(runId)
        if (!p.found) continue

        const streamingText = p.progress?.streamingText
        const step = p.progress?.step
        const completed = p.progress?.completedCount ?? p.progress?.completedAnalyses
        const total = p.progress?.totalCount ?? p.progress?.totalAnalyses
        const progress = total && total ? Math.min((completed ?? 0) / total, 1) : 0

        const title = streamingText ?? formatStepName(step)
        const subtext = completed != null && total != null
          ? `${completed}/${total} personas`
          : undefined

        const content = (
          <PersonaToastContent
            title={title}
            subtext={subtext}
            progress={progress}
            onView={() => {
              window.location.href = `/dashboard/generating/${runId}`
            }}
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss: () => persistDismiss(runId),
            duration: Infinity,
          })
          toastIdsRef.current.set(runId, id)
        }
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    // Re-run when the set of runIds changes (adds/removes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunIds.length])

  // ── Route-based toast suppression on /dashboard ──
  const prevPathnameRef = useRef<string>('')
  useEffect(() => {
    const isDashboard = pathname === '/dashboard'
    const wasDashboard = prevPathnameRef.current === '/dashboard'
    prevPathnameRef.current = pathname

    if (isDashboard && !wasDashboard) {
      // Entered dashboard — dismiss progress toasts (skeleton cards handle it)
      const runIds = usePersonaStore.getState().activeGenerationRunIds
      for (const runId of runIds) {
        const tid = toastIdsRef.current.get(runId)
        if (tid) {
          toast.dismiss(tid)
          toastIdsRef.current.delete(runId)
        }
      }
    }
  }, [pathname])

  return null
}

/** Match SimulationToaster's progress card exactly — ring animation, progress bar, View button */
function PersonaToastContent({
  title,
  subtext,
  progress,
  onView,
}: {
  title: string
  subtext?: string
  progress: number
  onView: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[sim-ring-fade_0.6s_ease-out_forwards]" />
      <div
        className="absolute inset-y-0 left-0 bg-primary/[0.06] transition-all duration-300 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
      <div className="relative z-10 flex items-start gap-3 p-4">
        <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary animate-spin" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtext && (
            <p className="text-xs text-muted-foreground">{subtext}</p>
          )}
        </div>
        <button
          onClick={onView}
          className="shrink-0 text-xs font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
        >
          View
        </button>
      </div>
    </div>
  )
}

/** Turn a raw step name like "BRAINSTORMING_PERSONAS" into "Brainstorming Personas" */
function formatStepName(step?: string): string {
  if (!step) return 'Generating personas...'
  return step
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase())
}
