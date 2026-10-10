/**
 * Loading skeleton for /dashboard.
 * Mirrors the SetupView layout — the first thing users see when no personas exist.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full h-full animate-in fade-in duration-300">
      {/* Headline skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-full max-w-64 rounded bg-muted animate-pulse" />
        <div className="h-5 w-full max-w-96 rounded bg-muted animate-pulse" />
      </div>

      <div className="grid gap-8">
        {/* Audience Description section */}
        <div className="flex flex-col gap-6 relative min-w-0">
          <div className="hidden md:flex absolute -left-12 top-0 h-8 w-8 items-center justify-center rounded-full border-2 border-border/40">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="h-6 w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full max-w-72 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
              <div className="flex justify-end">
                <div className="h-10 w-40 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Test Environment section */}
        <div className="flex flex-col gap-6 relative min-w-0">
          <div className="hidden md:flex absolute -left-12 top-0 h-8 w-8 items-center justify-center rounded-full border-2 border-border/40">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
          </div>
          <div className="rounded-lg border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="h-6 w-32 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full max-w-64 rounded bg-muted animate-pulse" />
              </div>
              <div className="flex gap-4">
                <div className="h-12 flex-1 rounded-md bg-muted animate-pulse" />
                <div className="h-12 w-48 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demo buttons */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-full sm:w-44 rounded-md bg-muted animate-pulse" />
        <div className="h-10 w-full sm:w-44 rounded-md bg-muted animate-pulse" />
      </div>
    </div>
  )
}
