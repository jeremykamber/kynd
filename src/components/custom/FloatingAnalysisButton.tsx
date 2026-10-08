'use client'

import { PlayIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/ui/stores/personaStore'

/**
 * Global floating "Run Analysis" CTA. Always visible — greyed out when the
 * user has no persona batches yet. Navigating with `?new=1` tells
 * /dashboard/analyses to open its "Run New Analysis" form, so the click has a
 * visible effect from any route (including the analyses page itself). Inside
 * the dashboard it also clears the mobile bottom tab bar, which owns the bottom
 * edge below `sm`.
 */
export function FloatingAnalysisButton() {
  const router = useRouter()
  const pathname = usePathname()
  const hasBatches = usePersonaStore((s) => s.batches.length > 0)

  const inDashboard = pathname?.startsWith('/dashboard') ?? false

  return (
    <button
      onClick={() => {
        if (hasBatches) router.push('/dashboard/analyses?new=1')
      }}
      className={cn(
        'fixed right-6 z-40 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-lg transition-all',
        inDashboard ? 'bottom-24 lg:bottom-6' : 'bottom-6',
        hasBatches
          ? 'border-border bg-background text-foreground hover:bg-accent cursor-pointer'
          : 'border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed',
      )}
    >
      <PlayIcon
        className={cn('h-3.5 w-3.5', !hasBatches && 'opacity-40')}
      />
Run Analysis
    </button>
  )
}
