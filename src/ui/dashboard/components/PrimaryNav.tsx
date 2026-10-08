'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FeedbackButton } from '@/components/custom/FeedbackButton'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { UserIcon, FileTextIcon, PlayIcon, MessageSquareIcon } from 'lucide-react'

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
 * The feedback entry opens a dialog instead of navigating, so it cannot be a
 * `PrimaryDestination`; it is rendered once per placement anyway so both
 * placements keep the same label and the neighbouring item styling. In the
 * pill it is pushed to the far right, leaving the destinations beside the
 * wordmark.
 */
function FeedbackItem({ placement }: { placement: 'pill' | 'tab' }) {
  const isPill = placement === 'pill'

  return (
    <FeedbackButton
      trigger={
        <button
          type="button"
          className={cn(isPill ? pillItemClass(false) : tabItemClass(false), isPill && 'ml-auto')}
        >
          <MessageSquareIcon className={cn(isPill ? 'size-4' : 'size-5', 'shrink-0')} />
          Feedback
        </button>
      }
    />
  )
}

/**
 * Primary dashboard navigation, rendered in two placements from one list so
 * their labels, targets and active states cannot drift:
 *
 * - from `lg` up, a floating sticky pill beside the wordmark;
 * - below `lg` (tablet and phone), a bottom tab bar only — the pill is not
 *   rendered as well, so there is never a top and bottom nav at once.
 *
 * The pill cannot fit three labelled destinations beside the wordmark on a
 * phone or tablet (they overflowed and scrolled two of them out of sight), so
 * the destinations move to the bottom bar rather than becoming a scrolling
 * strip. The breakpoint is `lg`, not `sm`, so a tablet does not get the
 * crowded top bar back.
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
      <header className="sticky top-0 z-40 hidden px-4 pb-2 pt-4 lg:block lg:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-lg border-2 border-border/60 bg-card/70 px-2.5 py-2 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
          <Link href="/" className="shrink-0 select-none px-2 text-lg font-bold tracking-tight">
            Kynd
          </Link>
          {/* Below `lg` the bottom tab bar owns navigation; the pill is hidden. */}
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
            {destinations.map((destination) => (
              <PillItem key={destination.id} destination={destination} />
            ))}
            <FeedbackItem placement="pill" />
          </nav>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 lg:hidden"
      >
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 px-2 py-1.5">
          {destinations.map((destination) => (
            <TabItem key={destination.id} destination={destination} />
          ))}
          <FeedbackItem placement="tab" />
        </div>
      </nav>
    </>
  )
}
