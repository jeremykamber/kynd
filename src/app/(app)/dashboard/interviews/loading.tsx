/**
 * Loading skeleton for /dashboard/interviews.
 * Mirrors the page header plus the two-step InterviewUploadClient layout:
 * upload zone, then generate card.
 */
export default function InterviewsLoading() {
  return (
    <div className="flex flex-col gap-10 max-w-4xl mx-auto w-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="h-8 w-full max-w-96 rounded bg-muted animate-pulse" />
        <div className="h-5 w-full max-w-lg rounded bg-muted animate-pulse" />
      </div>

      <div className="grid gap-12">
        {/* Step 1: Upload */}
        <div className="flex flex-col gap-6 relative min-w-0">
          {/* Step number badge skeleton */}
          <div className="hidden md:flex absolute -left-14 top-6 h-8 w-8 items-center justify-center rounded-full border-2 border-border/40">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="h-6 w-full max-w-56 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full max-w-72 rounded bg-muted animate-pulse" />
              </div>

              {/* Drop zone */}
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/40 p-10 md:p-12 gap-4">
                <div className="h-12 w-12 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full max-w-64 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full max-w-36 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Generate */}
        <div className="flex flex-col gap-6 relative min-w-0">
          <div className="hidden md:flex absolute -left-14 top-6 h-8 w-8 items-center justify-center rounded-full border-2 border-border/40">
            <div className="h-4 w-4 rounded bg-muted animate-pulse" />
          </div>

          <div className="rounded-lg border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="h-6 w-full max-w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full max-w-80 rounded bg-muted animate-pulse" />
              </div>
              <div className="flex justify-end">
                <div className="h-12 w-full max-w-64 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
