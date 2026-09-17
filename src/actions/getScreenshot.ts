"use server";

import { shouldRunLocally } from "@/infrastructure/config";
import { screenshotStore } from "@/infrastructure/screenshotStore";
import { vpsGet } from "./vpsClient";

/** Records a run's screenshot (base64) for local polling. */
export async function storeScreenshot(runId: string, base64: string): Promise<void> {
  screenshotStore.set(runId, base64);
}

/**
 * Returns a run's latest screenshot as base64: local mode reads the
 * in-memory store, remote mode GETs the VPS. `found: false` when none is
 * available.
 */
export async function getScreenshotAction(runId: string): Promise<{
  found: boolean;
  base64?: string;
}> {
  if (shouldRunLocally()) {
    const screenshot = screenshotStore.get(runId);
    if (!screenshot) return { found: false };
    return { found: true, base64: screenshot };
  }

  try {
    return await vpsGet("analyze-screenshot", { runId });
  } catch {
    console.error(`[SCREENSHOT_POLL] VPS returned error for ${runId}`);
    return { found: false };
  }
}
