import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-toggle'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-[rgba(26,26,27,0.1)] bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center gap-4 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image 
              src="/kynd_logo.png" 
              alt="Kynd" 
              width={20} 
              height={20} 
              className="object-contain"
            />
            <span className="font-bold tracking-tight text-lg select-none" style={{ fontFamily: 'var(--font-fraunces)' }}>
              Kynd
            </span>
          </Link>
          <div className="flex flex-1 items-center justify-end space-x-4">
            <nav className="flex items-center space-x-4 text-sm font-medium">
              <Link
                href="/dashboard"
                className="text-foreground/80 hover:text-foreground transition-colors"
              >
                Overview
              </Link>
              <Link
                href="/dashboard/settings"
                className="text-foreground/60 hover:text-foreground transition-colors"
              >
                Settings
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col pt-8 pb-16 px-4 sm:px-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}