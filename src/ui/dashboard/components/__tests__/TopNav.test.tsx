import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

const mockUsePathname = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

const mockSetActiveBatch = vi.fn();
type MockPersonaState = { setActiveBatch: typeof mockSetActiveBatch };
const mockPersonaState: MockPersonaState = { setActiveBatch: mockSetActiveBatch };
vi.mock("@/ui/stores/personaStore", () => ({
  usePersonaStore: (selector?: (state: MockPersonaState) => unknown) =>
    selector ? selector(mockPersonaState) : mockPersonaState,
}));

vi.mock("lucide-react", () => ({
  UserIcon: () => <svg data-testid="user-icon" />,
  FileTextIcon: () => <svg data-testid="file-text-icon" />,
  PlayIcon: () => <svg data-testid="play-icon" />,
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

import { TopNav } from "../TopNav";

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
  const { container, unmount } = render(<TopNav />);
  const el = container.querySelector(selector);
  if (!el) throw new Error(`Could not find nav item ${selector} on ${pathname}`);
  const className = el.className;
  unmount();
  return className;
}

const PERSONAS_ITEM = "nav button";

describe("TopNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("highlights Personas on /dashboard and stays on the batch list", () => {
    mockUsePathname.mockReturnValue("/dashboard");
    const { container } = render(<TopNav />);

    const activeClass = getPersonasButton(container).className;
    expect(activeClass).not.toBe(navItemClassName("/dashboard/interviews", PERSONAS_ITEM));

    fireEvent.click(getPersonasButton(container));
    expect(mockSetActiveBatch).toHaveBeenCalledWith(null);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("clears the active batch when Personas is selected from another section", () => {
    mockUsePathname.mockReturnValue("/dashboard/analyses");
    const { container } = render(<TopNav />);

    // Renders as inactive here...
    const inactiveClass = getPersonasButton(container).className;
    expect(inactiveClass).toBe(navItemClassName("/dashboard/interviews", PERSONAS_ITEM));

    // ...and selecting it returns to the batch list, not into the previously
    // active batch. This is the regression the old sidebar-on-mobile path had.
    fireEvent.click(getPersonasButton(container));
    expect(mockSetActiveBatch).toHaveBeenCalledWith(null);
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
