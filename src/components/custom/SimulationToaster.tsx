'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon } from 'lucide-react'
import type { Simulation } from '@/domain/entities/Simulation'

/**
 * Module-level toast ID map — survives component remounts so existing toasts
 * are never orphaned when React re-renders the tree (e.g. suspense, nav).
 */
const toastIdMap = new Map<string, string | number>()
const initialTerminalSims = new Set<string>()

function SimulationToastContent({
  sim,
  onView,
  actionLabel,
}: {
  sim: Simulation
  onView: () => void
  actionLabel?: string
}) {
  const completed = sim.completedAnalyses ?? 0
  const total = sim.totalAnalyses ?? 0
  const progress = total > 0 ? Math.min(completed / total, 1) : 0

  const statusConfig = {
    IN_PROGRESS: {
      icon: <ClockIcon className="h-4 w-4 shrink-0 text-primary animate-spin" />,
      label: sim.completedAnalyses != null && sim.totalAnalyses != null
        ? `${sim.completedAnalyses}/${sim.totalAnalyses} analyses`
        : 'Analyzing...',
      accentClass: 'bg-primary/[0.06]',
      ringClass: 'ring-primary/20',
      progressWidth: `${progress * 100}%`,
      buttonClass: 'text-primary hover:text-primary/80',
    },
    COMPLETED: {
      icon: <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />,
      label: 'Simulation complete',
      accentClass: 'bg-green-500/[0.06]',
      ringClass: 'ring-green-500/20',
      progressWidth: '100%',
      buttonClass: 'text-green-600 hover:text-green-700',
    },
    ERROR: {
      icon: <XCircleIcon className="h-4 w-4 shrink-0 text-destructive" />,
      label: sim.error || 'Simulation failed',
      accentClass: 'bg-destructive/[0.06]',
      ringClass: 'ring-destructive/20',
      progressWidth: '100%',
      buttonClass: 'text-destructive hover:text-destructive/80',
    },
    CANCELLED: {
      icon: <AlertCircleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />,
      label: 'Simulation cancelled',
      accentClass: 'bg-muted/30',
      ringClass: 'ring-muted-foreground/20',
      progressWidth: '100%',
      buttonClass: 'text-muted-foreground hover:text-foreground',
    },
  }[sim.status]

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      {sim.status === 'IN_PROGRESS' && (
        <div className="pointer-events-none absolute inset-0 z-20 rounded-lg ring-1 ring-primary/20 animate-[sim-ring-fade_0.6s_ease-out_forwards]" />
      )}
      <div
        className={`absolute inset-y-0 left-0 ${statusConfig.accentClass} transition-all duration-300 ease-out`}
        style={{ width: statusConfig.progressWidth }}
      />
      <div className="relative z-10 flex items-center gap-3 p-4">
        {statusConfig.icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{sim.name}</p>
          <p className="text-xs text-muted-foreground">{statusConfig.label}</p>
        </div>
        {actionLabel && (
          <button
            onClick={onView}
            className={`shrink-0 text-xs font-semibold underline underline-offset-4 transition-colors ${statusConfig.buttonClass}`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

export function SimulationToaster() {
  const lastSnapshotRef = useRef<string>('')

  const snapshot = useSimulationStore(
    (s) =>
      s.simulations
        .map(
          (sim) =>
            `${sim.id}:${sim.status}:${sim.completedAnalyses ?? 0}/${sim.totalAnalyses ?? 0}`,
        )
        .join('|'),
  )

  const persistDismiss = (id: string) => {
    toastIdMap.delete(id)
    useSimulationStore.getState().dismissSimulation(id)
  }

  useEffect(() => {
    // First mount: record which sims were already terminal so we never
    // create toasts for pre-existing completed/errored sims.
    if (lastSnapshotRef.current === '') {
      const store = useSimulationStore.getState()
      for (const id of store.dismissedSimulationIds) {
        toastIdMap.delete(id)
      }
      initialTerminalSims.clear()
      for (const sim of store.simulations) {
        if (sim.status === 'COMPLETED' || sim.status === 'ERROR' || sim.status === 'CANCELLED') {
          initialTerminalSims.add(sim.id)
        }
      }
      lastSnapshotRef.current = snapshot
      return
    }

    if (snapshot === lastSnapshotRef.current) return
    lastSnapshotRef.current = snapshot

    const simulations = useSimulationStore.getState().simulations
    const dismissedIds = useSimulationStore.getState().dismissedSimulationIds

    for (const sim of simulations) {
      if (dismissedIds.includes(sim.id)) continue
      if (initialTerminalSims.has(sim.id)) continue

      const existingToastId = toastIdMap.get(sim.id)

      const navigateTo = (path: string) => {
        window.location.href = path
      }

      const onDismiss = () => persistDismiss(sim.id)

      if (sim.status === 'IN_PROGRESS') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
            actionLabel="View"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
            duration: Infinity,
          })
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'COMPLETED') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
            actionLabel="View Results"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'ERROR') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
            actionLabel="Details"
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(sim.id, id)
        }
      } else if (sim.status === 'CANCELLED') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => navigateTo(`/dashboard/simulations/${sim.id}`)}
          />
        )

        if (existingToastId) {
          toast.custom(() => content, { id: existingToastId })
        } else {
          const id = toast.custom(() => content, {
            dismissible: true,
            onDismiss,
          })
          toastIdMap.set(sim.id, id)
        }
      }
    }
  }, [snapshot])

  return null
}
