/**
 * Loading skeleton for /dashboard/debates.
 * Mirrors the sidebar + room split of the debates layout, with the room pane
 * matching the centred empty state it resolves into.
 */
export default function DebatesLoading() {
  return (
    <div className="flex h-full w-full animate-in fade-in duration-300">
      {/* Sidebar skeleton (desktop only, matching DebateSidebar) */}
      <div className="hidden md:flex w-64 shrink-0 border-r border-border/40 bg-sidebar flex-col h-full">
        <div className="h-14 flex items-center px-5 border-b border-border/40">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex-1 flex flex-col gap-1 p-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full rounded-md bg-muted animate-pulse" />
          ))}
        </div>
        <div className="p-4 border-t border-border/40">
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        </div>
      </div>

      {/* Room area skeleton — centred empty state */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-40 rounded bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 w-40 rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
