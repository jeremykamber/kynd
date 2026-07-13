import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'sonner';
import { ToasterProvider } from '@/components/custom/ToasterProvider';
import { FloatingSimulationButton } from '@/components/custom/FloatingSimulationButton';

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
        <Analytics />
        <SpeedInsights />
        <Toaster
          position="bottom-right"
          expand
          visibleToasts={8}
          closeButton
          theme="dark"
        />
        <ToasterProvider />
        <FloatingSimulationButton />
      </body>
    </html>
  );
}
