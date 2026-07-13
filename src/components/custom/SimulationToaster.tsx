'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { usePathname } from 'next/navigation'
import { ClockIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon } from 'lucide-react'
import type { Simulation } from '@/domain/entities/Simulation'

function SimulationToastContent({
  sim,
  onView,
}: {
  sim: Simulation
  onView: () => void
}) {
  const completed = sim.completedAnalyses ?? 0
  const total = sim.totalAnalyses ?? 0
  const progress = total > 0 ? Math.min(completed / total, 1) : 0
  const label =
    sim.completedAnalyses != null && sim.totalAnalyses != null
      ? `${sim.completedAnalyses}/${sim.totalAnalyses} analyses`
      : 'Analyzing...'

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
          <p className="truncate text-sm font-semibold text-foreground">{sim.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
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

export function SimulationToaster() {
  const pathname = usePathname()
  const lastSnapshotRef = useRef<string>('')
  const lastPathnameRef = useRef<string>('')
  const throttleRef = useRef<number>(0)
  const dismissedRef = useRef<Set<string>>(new Set())
  const toastIdsRef = useRef<Map<string, string | number>>(new Map())
  const terminalAtInitRef = useRef<Set<string>>(new Set())

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
    dismissedRef.current.add(id)
    toastIdsRef.current.delete(id)
    useSimulationStore.getState().dismissSimulation(id)
  }

  useEffect(() => {
    // First mount: load persisted dismissed IDs and record which sims
    // were already in terminal state. Then set the snapshot baseline
    // so pre-existing sims never trigger toast creation.
    if (lastSnapshotRef.current === '') {
      const store = useSimulationStore.getState()
      for (const id of store.dismissedSimulationIds) {
        dismissedRef.current.add(id)
      }
      terminalAtInitRef.current = new Set(
        store.simulations
          .filter((s) => s.status === 'COMPLETED' || s.status === 'ERROR' || s.status === 'CANCELLED')
          .map((s) => s.id),
      )
      lastSnapshotRef.current = snapshot
      return
    }

    const now = Date.now()
    if (now - throttleRef.current < 300) return
    throttleRef.current = now

    if (snapshot === lastSnapshotRef.current && pathname === lastPathnameRef.current) return
    lastSnapshotRef.current = snapshot
    lastPathnameRef.current = pathname

    const simulations = useSimulationStore.getState().simulations

    for (const sim of simulations) {
      if (dismissedRef.current.has(sim.id)) continue
      // Never create a toast for a sim that was already terminal when we mounted
      if (terminalAtInitRef.current.has(sim.id)) continue

      // Don't show toast when viewing that simulation's detail page
      if (pathname?.includes(`/dashboard/simulations/${sim.id}`)) {
        const existingId = toastIdsRef.current.get(sim.id)
        if (existingId) {
          toast.dismiss(existingId)
          toastIdsRef.current.delete(sim.id)
        }
        continue
      }

      const existingToastId = toastIdsRef.current.get(sim.id)

      const navigateTo = (path: string) => {
        window.location.href = path
      }

      const viewAction = (label: string, path: string) => ({
        label,
        onClick: () => {
          navigateTo(path)
        },
      })

      const onDismiss = () => {
        persistDismiss(sim.id)
      }

      if (sim.status === 'IN_PROGRESS') {
        const content = (
          <SimulationToastContent
            sim={sim}
            onView={() => {
              navigateTo(`/dashboard/simulations/${sim.id}`)
            }}
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
          toastIdsRef.current.set(sim.id, id)
        }
      } else if (sim.status === 'COMPLETED') {
        if (existingToastId) {
          toast.success(sim.name, {
            id: existingToastId,
            description: 'Simulation complete',
            icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
            dismissible: true,
            onDismiss,
            action: viewAction('View Results', `/dashboard/simulations/${sim.id}`),
          })
        } else if (!dismissedRef.current.has(sim.id)) {
          const id = toast.success(sim.name, {
            description: 'Simulation complete',
            icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
            dismissible: true,
            onDismiss,
            action: viewAction('View Results', `/dashboard/simulations/${sim.id}`),
          })
          toastIdsRef.current.set(sim.id, id)
        }
      } else if (sim.status === 'ERROR') {
        if (existingToastId) {
          toast.error(sim.name, {
            id: existingToastId,
            description: sim.error || 'Simulation failed',
            icon: <XCircleIcon className="h-4 w-4 text-destructive" />,
            dismissible: true,
            onDismiss,
            action: viewAction('Details', `/dashboard/simulations/${sim.id}`),
          })
        } else {
          const id = toast.error(sim.name, {
            description: sim.error || 'Simulation failed',
            icon: <XCircleIcon className="h-4 w-4 text-destructive" />,
            dismissible: true,
            onDismiss,
            action: viewAction('Details', `/dashboard/simulations/${sim.id}`),
          })
          toastIdsRef.current.set(sim.id, id)
        }
      } else if (sim.status === 'CANCELLED') {
        if (existingToastId) {
          toast.warning(sim.name, {
            id: existingToastId,
            description: 'Simulation cancelled',
            icon: <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />,
            dismissible: true,
            onDismiss,
          })
        }
      }
    }
  }, [snapshot, pathname])

  return null
}
