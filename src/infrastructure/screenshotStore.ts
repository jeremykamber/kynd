/**
 * Shared in-memory screenshot store for VPS analysis.
 * Screenshots are large base64 strings delivered via a side-channel store
 * rather than the initial response body. Separated from getScreenshot.ts (a
 * "use server" file) so that VPS API routes can import it directly — "use
 * server" modules can only export async functions.
 *
 * Keyed by run ID; entries have no expiry and are never removed, so the store
 * grows for the life of the process. Written by `src/actions/getScreenshot.ts`
 * and read by that action and the analyze-screenshot route.
 *
 * Stored on globalThis to survive Next.js HMR (same pattern as progressStore.ts).
 */

const KEY = '__kynd_screenshot_store';
const screenshotStore: Map<string, string> =
  (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = new Map());

export { screenshotStore };
