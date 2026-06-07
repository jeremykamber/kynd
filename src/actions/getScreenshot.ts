"use server";

// In-memory store for latest screenshots per runId
// Screenshots are large base64 strings (200K+) that can't be reliably
// delivered through the RSC stream protocol. This store provides a
// side-channel for the client to poll during the scouting phase.
const screenshotStore = new Map<string, string>();

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
