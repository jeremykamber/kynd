import { TopNav } from '@/ui/dashboard/components/TopNav';

/**
 * App shell for the dashboard group: a floating top navigation bar at every
 * breakpoint (no sidebar), with route content in a centred, width-capped main
 * column.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-2 sm:px-6">
        {children}
      </main>
    </div>
  );
}
