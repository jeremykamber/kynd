"use server";

// In-memory store for latest screenshots per runId
// Screenshots are large base64 strings (200K+) that can't be reliably
// delivered through the RSC stream protocol. This store provides a
// side-channel for the client to poll during the scouting phase.
// Stored on globalThis to survive Next.js HMR (same pattern as getProgress.ts).
const SCREENSHOT_KEY = '__kynd_screenshot_store';
const screenshotStore: Map<string, string> =
  (globalThis as any)[SCREENSHOT_KEY] ?? ((globalThis as any)[SCREENSHOT_KEY] = new Map());

export async function storeScreenshot(runId: string, base64: string): Promise<void> {
  screenshotStore.set(runId, base64);
}

export async function getScreenshotAction(runId: string): Promise<{
  found: boolean;
  base64?: string;
}> {
  const screenshot = screenshotStore.get(runId);
  if (!screenshot) return { found: false };
  return { found: true, base64: screenshot };
}
