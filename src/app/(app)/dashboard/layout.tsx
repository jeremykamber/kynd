import { PrimaryNav } from '@/ui/dashboard/components/PrimaryNav';

/**
 * App shell for the dashboard group: primary navigation rendered by PrimaryNav
 * (a floating pill from `sm` up, a bottom tab bar below it), with route content
 * in a centred, width-capped main column. The extra bottom padding on small
 * screens keeps the last row clear of the tab bar.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PrimaryNav />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-28 pt-8 sm:px-6 lg:pb-16 lg:pt-10">
        {children}
      </main>
    </div>
  );
}
