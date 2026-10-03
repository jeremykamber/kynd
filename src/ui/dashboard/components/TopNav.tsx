'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { UserIcon, FileTextIcon, PlayIcon } from 'lucide-react'

function navItemClass(active: boolean) {
  return cn(
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
  )
}

/**
 * Floating top navigation for the dashboard, shown at every breakpoint — the
 * replacement for the old desktop sidebar. The bar is sticky and floats over
 * the scrolling content. Selecting "Personas" clears the active batch so the
 * persona batch list is always reachable, from any route or viewport.
 */
export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)

  const isPersonas = pathname === '/dashboard'
  const isInterviews = pathname === '/dashboard/interviews'
  const isAnalyses = pathname.startsWith('/dashboard/analyses')

  const handlePersonasClick = () => {
    setActiveBatch(null)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  return (
    <header className="sticky top-0 z-40 px-4 pb-2 pt-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-lg border-2 border-border/60 bg-card/70 px-2.5 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
        <Link href="/" className="shrink-0 select-none px-2 text-lg font-bold tracking-tight">
          Kynd
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          <button type="button" onClick={handlePersonasClick} className={navItemClass(isPersonas)}>
            <UserIcon className="size-4 shrink-0" />
            Personas
          </button>
          <Link href="/dashboard/interviews" className={navItemClass(isInterviews)}>
            <FileTextIcon className="size-4 shrink-0" />
            Interviews
          </Link>
          <Link href="/dashboard/analyses" className={navItemClass(isAnalyses)}>
            <PlayIcon className="size-4 shrink-0" />
            Analyses
          </Link>
        </nav>
      </div>
    </header>
  )
}
