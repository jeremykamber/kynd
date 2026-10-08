/**
 * Loading skeleton for /dashboard/analyses.
 * Card shapes mirror the AnalysisCard rows they stand in for.
 */
export default function AnalysesLoading() {
  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="h-5 w-52 rounded bg-muted animate-pulse" />
      </div>

      {/* Skeleton analysis cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              {/* Name + status */}
              <div className="flex items-center gap-3">
                <div className="h-6 w-48 rounded bg-muted animate-pulse" />
                <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
              </div>
              {/* URL + persona count */}
              <div className="flex items-center gap-4 mt-1">
                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              </div>
              {/* Progress row (in-progress runs) */}
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
              </div>
            </div>
            {/* Date */}
            <div className="flex flex-col gap-1 items-end shrink-0">
              <div className="h-4 w-20 rounded bg-muted animate-pulse" />
              <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
