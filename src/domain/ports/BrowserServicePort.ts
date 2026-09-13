/**
 * A remote browser session the persona can scan and scout an artifact with.
 *
 * Lifecycle: `captureScreenshot` is self-contained — it opens a session,
 * captures, and tears the session down. For finer control, call `navigateTo`
 * once and then any of the scouting methods; every method below requires a
 * session opened by `navigateTo` and throws otherwise. Always `close()` when
 * done. An implementation owns one session at a time; a second `navigateTo`
 * replaces the previous one.
 *
 * Screenshots are base64-encoded JPEG, not data URLs.
 */
export interface BrowserServicePort {
    /**
     * Navigates to a URL and captures the visual state.
     * Useful for the initial "scan" of a pricing page.
     * @param onProgress Reports setup/load/processing phase changes to the caller.
     * @returns Base64 encoded JPEG string of the full page
     */
    captureScreenshot(url: string, onProgress?: (status: 'SETTING_UP' | 'LOADING_WEBSITE' | 'PROCESSING') => void): Promise<string>;

    /**
     * Opens a session and navigates to `url`, leaving it open for the scouting
     * methods below. Navigation timeouts are non-fatal: the method resolves
     * with the page in whatever state it reached. Throws if the session
     * itself cannot be established.
     * @param onLiveScreenshot Called periodically while loading with a live
     *   viewport snapshot; rejections are ignored by the adapter.
     */
    navigateTo(url: string, onProgress?: (status: 'SETTING_UP' | 'LOADING_WEBSITE') => void, onLiveScreenshot?: (screenshotBase64: string) => Promise<void>): Promise<void>;
    /** Scrolls the viewport by `pixels` (negative scrolls up). */
    scrollDown(pixels: number): Promise<void>;
    /** Scrolls so `y` is at the top of the viewport. */
    scrollTo(y: number): Promise<void>;
    /**
     * Finds an element by CSS `selector`, falling back to case-insensitive
     * `anchorText` when the selector matches nothing.
     * @returns The element's document-relative Y coordinate, or null when
     *   neither locator matches.
     */
    getElementLocation(selector?: string, anchorText?: string): Promise<number | null>;
    /** Captures the visible viewport as base64 JPEG. */
    captureViewport(): Promise<string>;
    /** Captures the whole scrollable page as base64 JPEG. */
    captureFullPage(): Promise<string>;
    /**
     * Returns the page HTML with script/style and hidden elements stripped.
     * Returns an empty string when extraction fails rather than throwing.
     */
    getCleanedHtml(): Promise<string>;
    /** Closes the session and releases the connection. Safe to call twice. */
    close(): Promise<void>;
}
