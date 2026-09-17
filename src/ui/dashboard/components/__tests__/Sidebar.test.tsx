import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

// Stable mocks at module level
const mockUsePathname = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
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

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
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

function getPersonasButton(container: HTMLElement) {
  // The Personas nav item is a <button> inside the <nav>
  const buttons = container.querySelectorAll("nav button");
  for (const btn of buttons) {
    if (btn.textContent?.includes("Personas")) return btn;
  }
  throw new Error("Could not find Personas button");
}

// The nav marks its current section with pathname-dependent styling that is
// not addressable by any ARIA hook, so the active/inactive distinction is
// captured by rendering the same element under two routes and comparing the
// two renderings — restyle-proof, and false if the marking stops varying.
function navItemClassName(pathname: string, selector: string): string {
  mockUsePathname.mockReturnValue(pathname);
  const { container, unmount } = render(<Sidebar />);
  const el = container.querySelector(selector);
  if (!el) throw new Error(`Could not find nav item ${selector} on ${pathname}`);
  const className = el.className;
  unmount();
  return className;
}

const PERSONAS_ITEM = "nav button";

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("highlights Personas when on /dashboard", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<Sidebar />);

    // The current section renders differently from how the same item renders
    // on a sibling section.
    const activeClass = getPersonasButton(container).className;
    expect(activeClass).not.toBe(navItemClassName("/dashboard/interviews", PERSONAS_ITEM));

    // Selecting the current section resets the batch selection and stays put.
    fireEvent.click(getPersonasButton(container));
    expect(mockSetActiveBatch).toHaveBeenCalledWith(null);
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT highlight Personas when on /dashboard/interviews", () => {
    mockUsePathname.mockReturnValue("/dashboard/interviews");
    const { container } = render(<Sidebar />);

    // Renders exactly as it does on any other non-personas section...
    const inactiveClass = getPersonasButton(container).className;
    expect(inactiveClass).toBe(navItemClassName("/dashboard/analyses", PERSONAS_ITEM));
    // ...and selecting it does not reset the batch selection.
    fireEvent.click(getPersonasButton(container));
    expect(mockSetActiveBatch).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("does NOT highlight Personas when on /dashboard/analyses", () => {
    mockUsePathname.mockReturnValue("/dashboard/analyses");
    const { container } = render(<Sidebar />);

    const inactiveClass = getPersonasButton(container).className;
    expect(inactiveClass).toBe(navItemClassName("/dashboard/interviews", PERSONAS_ITEM));
    fireEvent.click(getPersonasButton(container));
    expect(mockSetActiveBatch).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("highlights Interviews when on /dashboard/interviews", () => {
    const activeClass = navItemClassName(
      "/dashboard/interviews",
      'a[href="/dashboard/interviews"]',
    );
    expect(activeClass).not.toBe(
      navItemClassName("/dashboard", 'a[href="/dashboard/interviews"]'),
    );
  });

  it("highlights Analyses when on /dashboard/analyses", () => {
    const activeClass = navItemClassName(
      "/dashboard/analyses",
      'a[href="/dashboard/analyses"]',
    );
    expect(activeClass).not.toBe(
      navItemClassName("/dashboard", 'a[href="/dashboard/analyses"]'),
    );
  });
});
