'use client'

import { PlayIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FIXED_BOTTOM_OFFSET_CLASS } from '@/lib/bottomClearance'
import { usePersonaStore } from '@/ui/stores/personaStore'

/** The analyses route owns its own "Run New Analysis" / "Run Analysis" CTAs. */
const ANALYSES_ROUTE = '/dashboard/analyses'

/** The personas route renders one batch's cards when a batch is selected. */
const PERSONAS_ROUTE = '/dashboard'

/**
 * Floating "Run Analysis" CTA. Mounted in the root layout, but it belongs to
 * the dashboard: on public routes it floated over body copy and advertised a
 * control the visitor has no data for, so it renders only under `/dashboard`.
 * It is a shortcut to *start* an analysis from elsewhere, so it stays off
 * `/dashboard/analyses` and its sub-routes, where that start control is already
 * on screen — otherwise the same primary action appears twice on one view.
 * Inside the dashboard it is greyed out when there are no persona batches yet,
 * and it sits at the shared bottom-action clearance
 * (`@/lib/bottomClearance`), the same one the tab bar, the content column's
 * padding and the toast stack use. Navigating with `?new=1` tells
 * /dashboard/analyses to open its "Run New Analysis" form, so the click has a
 * visible effect from any dashboard route.
 *
 * It also stays off a batch's cards on the personas route: a fixed 150x40
 * control in the bottom-right corner is over the third column's "Chat with
 * …" button at some scroll position on every card grid that overflows the
 * viewport (measured: up to 1406px² of the button), and reserving the content
 * column's clearance cannot fix that — padding moves where the page ends, not
 * where a floating control sits. A card grid is a results view with its own
 * actions, exactly like the analyses list this shortcut already leaves.
 */
export function FloatingAnalysisButton() {
  const router = useRouter()
  const pathname = usePathname()
  const hasBatches = usePersonaStore((s) => s.batches.length > 0)
  /** True while the personas route is showing a batch's cards, not the setup form. */
  const showingBatchCards = usePersonaStore((s) => s.activeBatchId !== null)

  const isAnalysesRoute = pathname === ANALYSES_ROUTE || (pathname?.startsWith(`${ANALYSES_ROUTE}/`) ?? false)
  if (!(pathname?.startsWith('/dashboard') ?? false) || isAnalysesRoute) return null
  if (pathname === PERSONAS_ROUTE && showingBatchCards) return null

  return (
    <button
      onClick={() => {
        if (hasBatches) router.push('/dashboard/analyses?new=1')
      }}
      className={cn(
        'fixed right-6 z-40 inline-flex h-10 items-center gap-2 rounded-md border px-5 text-sm font-medium transition-colors',
        FIXED_BOTTOM_OFFSET_CLASS,
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
