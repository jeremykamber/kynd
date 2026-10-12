import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { Toaster } from 'sonner';
import { ToasterProvider } from '@/components/custom/ToasterProvider';
import { FloatingAnalysisButton } from '@/components/custom/FloatingAnalysisButton';
import {
  TOAST_BOTTOM_OFFSET_PX,
  TOAST_SIDE_OFFSET_PX,
} from '@/lib/bottomClearance';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Kynd',
  description: 'AI-driven persona generation and analysis.',
  icons: {
    icon: '/kynd_logo.svg',
  },
};

/**
 * Root layout: every route renders inside it. Owns the font variables, the
 * forced dark theme, and the global toast / floating-analysis-button overlays.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary`}
      >
        {children}
        <Script
          type="module"
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "248113f4f5094418bd7d88a3c576b8a2"}'
          strategy="afterInteractive"
        />
        <Toaster
          position="bottom-right"
          expand
          visibleToasts={8}
          closeButton
          theme="dark"
          // The stack starts above the dashboard's fixed bottom chrome instead
          // of in sonner's default corner inset; the clearance (and why both
          // offsets are the same value) is in @/lib/bottomClearance.
          offset={{ bottom: TOAST_BOTTOM_OFFSET_PX, right: TOAST_SIDE_OFFSET_PX.desktop }}
          mobileOffset={{ bottom: TOAST_BOTTOM_OFFSET_PX, right: TOAST_SIDE_OFFSET_PX.mobile }}
          // Toast chrome is not a control. The stack never takes a click that
          // belongs to the page beneath it, and each toast opts back in only
          // where it has something to click (an individual toast sets
          // `pointer-events: none` when it is purely informational).
          style={{ pointerEvents: 'none' }}
          toastOptions={{ style: { pointerEvents: 'auto' } }}
        />
        <ToasterProvider />
        <FloatingAnalysisButton />
      </body>
    </html>
  );
}
