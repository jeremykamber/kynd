import { describe, it, expect, vi } from "vitest";
import type { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { ArtifactIntakeAdapter } from "../ArtifactIntakeAdapter";

function makeLlm(): LlmServicePort {
  return { summarizeHtml: vi.fn().mockResolvedValue("summary") } as unknown as LlmServicePort;
}

describe("ArtifactIntakeAdapter URL intake", () => {
  it("rejects instead of capturing a blank page when the browser cannot load the URL", async () => {
    const browser = {
      navigateTo: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Could not load https://nonexistent.example — the page did not respond (net::ERR_NAME_NOT_RESOLVED)",
          ),
        ),
      captureViewport: vi.fn(),
      getCleanedHtml: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserServicePort;

    const adapter = new ArtifactIntakeAdapter(browser, makeLlm());

    await expect(
      adapter.intake({ type: "url", url: "https://nonexistent.example" }),
    ).rejects.toThrow(/Could not load https:\/\/nonexistent\.example — the page did not respond/);

    // A failed navigation must not be turned into a screenshot/summary.
    expect(browser.captureViewport).not.toHaveBeenCalled();
    expect(browser.getCleanedHtml).not.toHaveBeenCalled();
    // The session is still torn down on failure.
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
