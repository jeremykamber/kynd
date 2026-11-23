import Image from 'next/image';
import Link from 'next/link';

/**
 * Chrome for the public marketing routes: a static header and footer around the
 * page content, with no data fetching and no app-shell chrome.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-8">
          <Link
            href="/"
            className="flex h-11 shrink-0 items-center space-x-2 rounded-md focus-ring"
          >
            <Image src="/kynd_logo.svg" alt="" width={32} height={32} className="h-8 w-8" priority />
            <span className="font-semibold tracking-tight text-lg select-none">
              Kynd
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium md:gap-6">
            <Link
              href="#how-it-works"
              className="inline-flex h-11 items-center rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-ring"
            >
              How it works
            </Link>
            {/*
              TODO(KYND-0009): re-enable once a pricing section or page exists —
              `#pricing` targets an anchor that is not on the page, so the link
              was a silent no-op. Commented out rather than deleted.
              <Link
                href="#pricing"
                className="transition-colors hover:text-primary text-muted-foreground"
              >
                Pricing
              </Link>
            */}
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-md px-1 text-muted-foreground transition-colors hover:text-foreground focus-ring"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-border/40 py-16 bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-6 md:flex-row md:px-8">
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-2">
              <Image src="/kynd_logo.svg" alt="" width={24} height={24} className="h-6 w-6" />
              <span className="font-semibold tracking-tight text-lg select-none">
                Kynd
              </span>
            </div>
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; {new Date().getFullYear()} Kynd. All rights reserved.
            </p>
          </div>
          {/*
            TODO(KYND-0008): re-enable once real pages exist. Privacy, Terms and
            Contact pointed at `href="#"`, i.e. a silent jump to the top — worse
            for trust than not offering them. Commented out rather than deleted.
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-primary transition-colors">
                Privacy
              </Link>
              <Link href="#" className="hover:text-primary transition-colors">
                Terms
              </Link>
              <Link href="#" className="hover:text-primary transition-colors">
                Contact
              </Link>
            </div>
          */}
        </div>
      </footer>
    </div>
  );
}
