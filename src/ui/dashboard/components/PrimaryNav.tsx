'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { UserIcon, FileTextIcon, PlayIcon } from 'lucide-react'

interface PrimaryDestination {
  id: string
  label: string
  href: string
  Icon: typeof UserIcon
  active: boolean
  /**
   * Side effect that must run before landing on the destination. Present on
   * "Personas", which clears the active batch so the batch list is always
   * reachable from any route.
   */
  onSelect?: () => void
}

function pillItemClass(active: boolean) {
  return cn(
    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
  )
}

function tabItemClass(active: boolean) {
  return cn(
    'flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
  )
}

function PillItem({ destination }: { destination: PrimaryDestination }) {
  const { label, href, Icon, active, onSelect } = destination
  const className = pillItemClass(active)

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        <Icon className="size-4 shrink-0" />
        {label}
      </button>
    )
  }

  return (
    <Link href={href} className={className}>
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  )
}

function TabItem({ destination }: { destination: PrimaryDestination }) {
  const { label, href, Icon, active, onSelect } = destination
  const className = tabItemClass(active)

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={className}>
        <Icon className="size-5 shrink-0" />
        {label}
      </button>
    )
  }

  return (
    <Link href={href} className={className}>
      <Icon className="size-5 shrink-0" />
      {label}
    </Link>
  )
}

/**
 * Primary dashboard navigation, rendered in two placements from one list so
 * their labels, targets and active states cannot drift:
 *
 * - from `sm` up, a floating sticky pill beside the wordmark;
 * - below `sm`, a persistent bottom tab bar.
 *
 * The pill cannot fit three labelled destinations beside the wordmark on a
 * phone (they overflowed and scrolled two of them out of sight), so the
 * destinations move to the bottom bar rather than becoming a scrolling strip.
 */
export function PrimaryNav() {
  const pathname = usePathname()
  const router = useRouter()
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)

  const destinations: PrimaryDestination[] = [
    {
      id: 'personas',
      label: 'Personas',
      href: '/dashboard',
      Icon: UserIcon,
      active: pathname === '/dashboard',
      onSelect: () => {
        setActiveBatch(null)
        if (pathname !== '/dashboard') router.push('/dashboard')
      },
    },
    {
      id: 'interviews',
      label: 'Interviews',
      href: '/dashboard/interviews',
      Icon: FileTextIcon,
      active: pathname === '/dashboard/interviews',
    },
    {
      id: 'analyses',
      label: 'Analyses',
      href: '/dashboard/analyses',
      Icon: PlayIcon,
      active: pathname.startsWith('/dashboard/analyses'),
    },
  ]

  return (
    <>
      <header className="sticky top-0 z-40 px-4 pb-2 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-lg border-2 border-border/60 bg-card/70 px-2.5 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
          <Link href="/" className="shrink-0 select-none px-2 text-lg font-bold tracking-tight">
            Kynd
          </Link>
          {/* Below `sm` the bottom tab bar owns navigation. */}
          <nav className="hidden items-center gap-1 sm:flex">
            {destinations.map((destination) => (
              <PillItem key={destination.id} destination={destination} />
            ))}
          </nav>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 sm:hidden"
      >
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 px-2 py-1.5">
          {destinations.map((destination) => (
            <TabItem key={destination.id} destination={destination} />
          ))}
        </div>
      </nav>
    </>
  )
}
