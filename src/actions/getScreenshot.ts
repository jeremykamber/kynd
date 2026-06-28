"use server";

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;
const RUN_LOCALLY = process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";

// In-memory store for latest screenshots per runId
// Screenshots are large base64 strings (200K+) that can't be reliably
// delivered through the RSC stream protocol. This store provides a
// side-channel for the client to poll during the scouting phase.
// Stored on globalThis to survive Next.js HMR (same pattern as getProgress.ts).
const SCREENSHOT_KEY = '__kynd_screenshot_store';
const screenshotStore: Map<string, string> =
  (globalThis as any)[SCREENSHOT_KEY] ?? ((globalThis as any)[SCREENSHOT_KEY] = new Map());

export async function storeScreenshot(runId: string, base64: string): Promise<void> {
  if (RUN_LOCALLY) {
    screenshotStore.set(runId, base64);
  }
}

export async function getScreenshotAction(runId: string): Promise<{
  found: boolean;
  base64?: string;
}> {
  if (RUN_LOCALLY) {
    const screenshot = screenshotStore.get(runId);
    if (!screenshot) return { found: false };
    return { found: true, base64: screenshot };
  }

  const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-screenshot?runId=${runId}`, {
    headers: { Authorization: `Bearer ${VPS_AUTH_TOKEN}` },
  });
  return res.json();
}
