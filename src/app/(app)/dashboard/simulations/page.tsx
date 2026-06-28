'use client'

import { useMemo } from 'react'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon } from 'lucide-react'
import { computeRunAverages } from '@/ui/dashboard/utils/computeBenchmarks'

function SimulationCard({ simulation }: { simulation: import('@/domain/entities/Simulation').Simulation }) {
  const router = useRouter()
  const removeSimulation = useSimulationStore((s) => s.removeSimulation)

  const statusConfig = {
    IN_PROGRESS: { label: 'In Progress', icon: ClockIcon, class: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    COMPLETED: { label: 'Completed', icon: CheckCircleIcon, class: 'text-green-500 bg-green-500/10 border-green-500/20' },
    ERROR: { label: 'Error', icon: XCircleIcon, class: 'text-destructive bg-destructive/10 border-destructive/20' },
    CANCELLED: { label: 'Cancelled', icon: AlertCircleIcon, class: 'text-muted-foreground bg-muted/30 border-muted/40' },
  }[simulation.status]

  const StatusIcon = statusConfig.icon

  const runAverages = useMemo(() => {
    if (simulation.status === 'COMPLETED' && simulation.analyses && simulation.analyses.length > 0) {
      return computeRunAverages(simulation.analyses)
    }
    return null
  }, [simulation.analyses, simulation.status])

  return (
    <div className="relative group">
      <button
        onClick={() => router.push(`/dashboard/simulations/${simulation.id}`)}
        className="w-full text-left rounded-lg border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold truncate">{simulation.name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.class}`}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
                {simulation.status === 'IN_PROGRESS' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GlobeIcon className="h-3 w-3" />
                {simulation.url}
              </span>
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {simulation.personaCount} personas
              </span>
            </div>
            {simulation.batchName && (
              <p className="text-xs text-muted-foreground/70">Batch: {simulation.batchName}</p>
            )}
            {simulation.status === 'COMPLETED' && runAverages && (
              <div className="flex items-center gap-2 mt-1">
                {[
                  { key: 'clarity', label: 'Clarity' },
                  { key: 'trust', label: 'Trust' },
                  { key: 'buyIntent', label: 'Buy' },
                ].map(({ key, label }) => {
                  const val = (runAverages as any)[key] ?? 0;
                  const pct = (val / 10) * 100;
                  const bgColor = val >= 7 ? 'rgba(34,197,94,0.12)' : val >= 4 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)';
                  const borderColor = val >= 7 ? 'border-green-500/25' : val >= 4 ? 'border-amber-500/25' : 'border-red-500/25';
                  return (
                    <div key={key} className={`relative rounded-md border ${borderColor} overflow-hidden min-w-[56px]`}>
                      <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: bgColor }} />
                      <div className="relative p-1.5 flex flex-col items-center z-10">
                        <span className="text-sm font-bold tabular-nums leading-tight">{val.toFixed(1)}</span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(simulation.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {simulation.completedAt && simulation.status !== 'IN_PROGRESS' && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 whitespace-nowrap">
                {new Date(simulation.completedAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        {simulation.status === 'IN_PROGRESS' && simulation.totalAnalyses && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{simulation.completedAnalyses ?? 0}/{simulation.totalAnalyses} analyses</span>
              <span className="tabular-nums font-medium">{Math.round(((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100}%` }}
              />
            </div>
          </div>
        )}
        {simulation.error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">{simulation.error}</p>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeSimulation(simulation.id)
        }}
        className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none"
        aria-label="Delete simulation"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

export default function SimulationsPage() {
  const simulations = useSimulationStore((s) => s.simulations)

  const inProgress = simulations.filter((s) => s.status === 'IN_PROGRESS')
  const completed = simulations.filter((s) => s.status !== 'IN_PROGRESS')

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
        <p className="text-sm text-muted-foreground">
          {simulations.length === 0
            ? 'No simulations yet. Run a pricing simulation from the dashboard to get started.'
            : `${completed.length} completed · ${inProgress.length} in progress`}
        </p>
      </div>

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </h2>
          <div className="flex flex-col gap-3">
            {inProgress.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-3">
            {completed.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {simulations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <ClockIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm">
            Run a pricing simulation from the dashboard with your personas, and it will appear here.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
