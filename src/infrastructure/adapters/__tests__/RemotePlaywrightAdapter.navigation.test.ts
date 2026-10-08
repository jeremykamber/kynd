import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const page = {
    url: vi.fn(() => "about:blank"),
    goto: vi.fn(),
    screenshot: vi.fn(async () => Buffer.from("img")),
    close: vi.fn(async () => {}),
    mouse: { move: vi.fn(async () => {}) },
    waitForTimeout: vi.fn(async () => {}),
  };
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  };
  const browser = {
    newContext: vi.fn(async () => context),
    disconnect: vi.fn(),
  };
  const chromium = { connect: vi.fn(async () => browser) };
  return { page, context, browser, chromium };
});

vi.mock("playwright", () => ({ chromium: {} }));
vi.mock("playwright-extra", () => ({ addExtra: () => h.chromium }));
vi.mock("puppeteer-extra-plugin-stealth", () => ({ default: {} }));

import { RemotePlaywrightAdapter } from "../RemotePlaywrightAdapter";

describe("RemotePlaywrightAdapter.navigateTo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.page.url.mockReturnValue("about:blank");
  });

  it("rejects when navigation fails and the page never leaves about:blank", async () => {
    h.page.goto.mockRejectedValueOnce(
      new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at https://nonexistent.example/"),
    );
    const adapter = new RemotePlaywrightAdapter("ws://test");

    await expect(adapter.navigateTo("https://nonexistent.example")).rejects.toThrow(
      /Could not load https:\/\/nonexistent\.example — the page did not respond/,
    );
  });

  it("rejects for an invalid URL the same way", async () => {
    h.page.goto.mockRejectedValueOnce(
      new Error("page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL"),
    );
    const adapter = new RemotePlaywrightAdapter("ws://test");

    await expect(adapter.navigateTo("not a url")).rejects.toThrow(/did not respond/);
  });

  it("stays best-effort when a navigation timeout still reached the target page", async () => {
    h.page.goto.mockRejectedValueOnce(new Error("page.goto: Timeout 30000ms exceeded."));
    h.page.url.mockReturnValue("https://example.com/");
    const adapter = new RemotePlaywrightAdapter("ws://test");

    await expect(adapter.navigateTo("https://example.com")).resolves.toBeUndefined();
  });
});
