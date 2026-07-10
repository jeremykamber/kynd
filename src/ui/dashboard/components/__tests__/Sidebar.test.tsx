import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Stable mocks at module level
const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const mockSetActiveBatch = vi.fn();
const mockPersonaState = { batches: [], activeBatchId: null, setActiveBatch: mockSetActiveBatch };
vi.mock("@/ui/stores/personaStore", () => ({
  usePersonaStore: (selector?: (state: any) => any) =>
    selector ? selector(mockPersonaState) : mockPersonaState,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  MessageSquareIcon: () => <svg data-testid="message-square-icon" />,
  UserIcon: () => <svg data-testid="user-icon" />,
  FileTextIcon: () => <svg data-testid="file-text-icon" />,
  PlayIcon: () => <svg data-testid="play-icon" />,
  LayersIcon: () => <svg data-testid="layers-icon" />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "../Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Debates link with correct href", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<Sidebar />);

    const link = container.querySelector('a[href="/dashboard/debates"]');
    expect(link).not.toBeNull();
    expect(container.querySelector('[data-testid="message-square-icon"]')).not.toBeNull();
  });

  it("does NOT highlight the home link when on /dashboard/debates", () => {
    mockUsePathname.mockReturnValue("/dashboard/debates");
    const { container } = render(<Sidebar />);

    const homeLink = container.querySelector('a[href="/dashboard"]');
    expect(homeLink).not.toBeNull();

    const cls = homeLink!.getAttribute("class") ?? "";
    expect(cls).not.toContain("bg-primary/10");
  });

  it("highlights the Debates link when on /dashboard/debates", () => {
    mockUsePathname.mockReturnValue("/dashboard/debates");
    const { container } = render(<Sidebar />);

    const debatesLink = container.querySelector('a[href="/dashboard/debates"]');
    expect(debatesLink).not.toBeNull();

    const cls = debatesLink!.getAttribute("class") ?? "";
    expect(cls).toContain("bg-primary/10");
  });

  it("highlights the home link when on /dashboard", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<Sidebar />);

    const homeLink = container.querySelector('a[href="/dashboard"]');
    expect(homeLink).not.toBeNull();

    const cls = homeLink!.getAttribute("class") ?? "";
    expect(cls).toContain("bg-primary/10");
  });
});
