'use client'

import { PlayIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/ui/stores/personaStore'

/**
 * Floating "Run Analysis" CTA. Mounted in the root layout, but it belongs to
 * the dashboard: on public routes it floated over body copy and advertised a
 * control the visitor has no data for, so it renders only under `/dashboard`.
 * Inside the dashboard it is greyed out when there are no persona batches yet,
 * and it clears the mobile bottom tab bar, which owns the bottom edge below
 * `lg`. Navigating with `?new=1` tells /dashboard/analyses to open its "Run New
 * Analysis" form, so the click has a visible effect from any dashboard route.
 */
export function FloatingAnalysisButton() {
  const router = useRouter()
  const pathname = usePathname()
  const hasBatches = usePersonaStore((s) => s.batches.length > 0)

  if (!(pathname?.startsWith('/dashboard') ?? false)) return null

  return (
    <button
      onClick={() => {
        if (hasBatches) router.push('/dashboard/analyses?new=1')
      }}
      className={cn(
        'fixed bottom-24 right-6 z-40 inline-flex h-10 items-center gap-2 rounded-md border px-5 text-sm font-medium transition-colors lg:bottom-6',
        hasBatches
          ? 'border-border/60 bg-card text-foreground hover:bg-muted/30 cursor-pointer'
          : 'border-border/40 bg-muted/30 text-muted-foreground/40 cursor-not-allowed',
      )}
    >
      <PlayIcon className={cn('size-4', !hasBatches && 'opacity-40')} />
      Run Analysis
    </button>
  )
}
