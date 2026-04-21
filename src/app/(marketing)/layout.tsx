import Link from 'next/link'
import Image from 'next/image'
import { ThemeToggle } from '@/components/theme-toggle'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen selection:bg-ink/20">
      <header className="sticky top-0 z-50 w-full border-b border-[rgba(26,26,27,0.1)] bg-[#F2F0E9]/95 backdrop-blur supports-[backdrop-filter]:bg-[#F2F0E9]/60">
        <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image 
              src="/kynd_logo.png" 
              alt="Kynd" 
              width={24} 
              height={24} 
              className="object-contain"
            />
            <span className="font-bold tracking-tight text-lg select-none" style={{ fontFamily: 'var(--font-fraunces)' }}>
              Kynd
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="#features"
              className="transition-colors hover:text-ink text-muted-foreground"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="transition-colors hover:text-ink text-muted-foreground"
            >
              Pricing
            </Link>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="transition-colors text-foreground hover:text-ink font-semibold"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-[rgba(26,26,27,0.1)] py-12 bg-[#F2F0E9]">
        <div className="container mx-auto max-w-screen-xl px-6 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2">
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
            </div>
            <p className="text-sm text-muted-foreground mt-2 text-center md:text-left">
              &copy; {new Date().getFullYear()} Kynd. Made with care.
            </p>
          </div>
          <div className="flex space-x-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-ink transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-ink transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-ink transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}