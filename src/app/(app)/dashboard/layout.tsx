import { PrimaryNav } from '@/ui/dashboard/components/PrimaryNav';
import { CONTENT_BOTTOM_PADDING_CLASS } from '@/lib/bottomClearance';

/**
 * App shell for the dashboard group: primary navigation rendered by PrimaryNav
 * (a floating pill from `lg` up, a bottom tab bar below it), with route content
 * in a centred, width-capped main column. The bottom padding is the dashboard's
 * clearance contract for the tab bar and every other fixed bottom element — see
 * `@/lib/bottomClearance`; it is the one value all of them agree on.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PrimaryNav />
      <main
        className={`mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-8 sm:px-6 lg:pt-10 ${CONTENT_BOTTOM_PADDING_CLASS}`}
      >
        {children}
      </main>
    </div>
  );
}
