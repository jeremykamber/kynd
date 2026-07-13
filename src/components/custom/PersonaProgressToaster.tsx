'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ClockIcon, CheckCircleIcon, XCircleIcon, LayersIcon } from 'lucide-react'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { getProgressAction } from '@/actions/getProgress'
import { getPersonaGenerationResultAction } from '@/actions/getPersonaGenerationResult'
import { usePathname } from 'next/navigation'

/**
 * Background toaster that polls active persona generation runIds and surfaces
 * progress/completion/errors as Sonner toasts.
 *
 * Mirrors SimulationToaster pattern — mounted at the app layout level so it
 * survives navigation. The hook (usePersonaFlow / useInterviewPipeline)
 * registers a runId in personaStore when generation starts and removes it on
 * completion or cancellation.
 */
export function PersonaProgressToaster() {
  const pathname = usePathname()
  const activeRunIds = usePersonaStore((s) => s.activeGenerationRunIds)
  const removedRef = useRef<Set<string>>(new Set())
  const toastIdsRef = useRef<Map<string, string | number>>(new Map())
  const lastCompletionRef = useRef<Set<string>>(new Set())
  const lastSnapshotRef = useRef<string>('')
  const pathnameRef = useRef<string>('')
  const throttleRef = useRef<number>(0)

  // Serialise active run IDs so the snapshot comparator catches adds/removes
  const snapshot = activeRunIds.sort().join(',')

  const persistDismiss = (runId: string) => {
    removedRef.current.add(runId)
    toastIdsRef.current.delete(runId)
    usePersonaStore.getState().removeActiveGeneration(runId)
  }

  useEffect(() => {
    const now = Date.now()
    if (now - throttleRef.current < 300) return
    throttleRef.current = now

    if (snapshot === lastSnapshotRef.current && pathname === pathnameRef.current) return
    lastSnapshotRef.current = snapshot
    pathnameRef.current = pathname

    for (const runId of activeRunIds) {
      // Skip if this run was explicitly dismissed
      if (removedRef.current.has(runId)) continue

      const existingToastId = toastIdsRef.current.get(runId)

      // ── Poll progress → show/hide toast per runId ──────────────
      ;(async () => {
        // First check for a final result (completed/error)
        const result = await getPersonaGenerationResultAction(runId)

        if (result.found) {
          if (lastCompletionRef.current.has(runId)) return

          lastCompletionRef.current.add(runId)

          if (result.error) {
            // ── Error state ─────────────────────────────────────
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
            return
          }

          const personaCount = result.personas?.length ?? 0

          // ── Completed state ────────────────────────────────────
          if (existingToastId) {
            toast.success(`${personaCount} Personas Ready`, {
              id: existingToastId,
              icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
              dismissible: true,
              onDismiss: () => persistDismiss(runId),
              action: {
                label: 'View Batch',
                onClick: () => {
                  persistDismiss(runId)
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
                  persistDismiss(runId)
                  window.location.href = '/dashboard'
                },
              },
            })
            toastIdsRef.current.set(runId, id)
          }
          return
        }

        // ── Still in progress — poll progress details ──────────
        const p = await getProgressAction(runId)
        const step = p.found && p.progress?.step ? p.progress.step : 'Generating...'
        const details =
          p.found && p.progress?.completedCount != null && p.progress?.totalCount != null
            ? `${p.progress.completedCount}/${p.progress.totalCount}`
            : p.found && p.progress?.streamingText
              ? p.progress.streamingText
              : undefined

        const content = (
          <ProgressToastContent
            label={step}
            details={details}
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          // Don't create a toast until the first progress update comes back
          if (!p.found) return
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss: () => persistDismiss(runId),
            duration: Infinity,
          })
          toastIdsRef.current.set(runId, id)
        }
      })()
    }
  }, [snapshot, pathname])

  return null
}

/** Inline content component for the progress toast */
function ProgressToastContent({
  label,
  details,
}: {
  label: string
  details?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative z-10 flex items-start gap-3 p-4">
        <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary animate-spin" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          {details && (
            <p className="text-xs text-muted-foreground">{details}</p>
          )}
        </div>
      </div>
    </div>
  )
}
