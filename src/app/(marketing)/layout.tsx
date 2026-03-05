import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6 md:px-8">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-lg select-none">
              Deep<span className="text-muted-foreground">Bound</span>
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="#features"
              className="transition-colors hover:text-primary text-muted-foreground"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="transition-colors hover:text-primary text-muted-foreground"
            >
              Pricing
            </Link>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="transition-colors text-foreground hover:text-primary font-semibold"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t border-border/40 py-12 bg-background">
        <div className="container mx-auto max-w-screen-xl px-6 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <span className="font-bold tracking-tight text-lg select-none">
              Deep<span className="text-muted-foreground">Bound</span>
            </span>
            <p className="text-sm text-muted-foreground mt-2 text-center md:text-left">
              &copy; {new Date().getFullYear()} DeepBound. All rights reserved.
            </p>
          </div>
          <div className="flex space-x-6 text-sm text-muted-foreground">
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
        </div>
      </footer>
    </div>
  );
}
