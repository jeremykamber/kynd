import { chromium as baseChromium } from "playwright";
import { addExtra } from "playwright-extra";
import { Browser, BrowserContext, Page } from "playwright-core";
import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const chromium = addExtra(baseChromium);
// chromium.use(StealthPlugin());

export class RemotePlaywrightAdapter implements BrowserServicePort {
    private readonly wsEndpoint: string;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    // Config defaults
    private readonly VIEWPORT = { width: 1280, height: 800 };
    private readonly TIMEOUT_MS = 30000;

    constructor(wsEndpoint: string) {
        this.wsEndpoint = wsEndpoint;
    }

    /**
     * Factory method to ensure env vars are checked at runtime, not import time.
     */
    static createFromEnv(): RemotePlaywrightAdapter {
        const endpoint = process.env.PLAYWRIGHT_WS_ENDPOINT;

        if (!endpoint) {
            throw new Error(
                "Missing PLAYWRIGHT_WS_ENDPOINT. " +
                "Ensure your VPS is running the browser server and the variable is set in .env",
            );
        }

        return new RemotePlaywrightAdapter(endpoint);
    }

    /**
     * Connects to the remote browser and navigates.
     * Captures live screenshots every 500ms during navigation for live feed.
     */
    async navigateTo(
        url: string,
        onProgress?: (status: "SETTING_UP" | "LOADING_WEBSITE") => void,
        onLiveScreenshot?: (screenshotBase64: string) => Promise<void>,
    ): Promise<void> {
        try {
            onProgress?.("SETTING_UP");
            console.log(`[BrowserAdapter] Connecting to ${this.wsEndpoint}...`);
            this.browser = await chromium.connect(this.wsEndpoint);

            this.context = await this.browser.newContext({
                viewport: this.VIEWPORT,
                deviceScaleFactor: 1,
                // Modern, non-bot-looking User Agent
                userAgent:
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                locale: "en-US",
                timezoneId: "America/New_York",
                permissions: ["geolocation"],
                extraHTTPHeaders: {
                    "Accept-Language": "en-US,en;q=0.9",
                    "sec-ch-ua":
                        '"Chromium";v="128", "Not=A?Brand";v="24", "Google Chrome";v="128"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"macOS"',
                    "upgrade-insecure-requests": "1",
                },
            });

            this.page = await this.context.newPage();

            console.log(`[BrowserAdapter] Navigating to ${url}...`);

            onProgress?.("LOADING_WEBSITE");

            // Start live screenshot feed during navigation
            let isNavigating = true;
            const screenshotInterval = setInterval(async () => {
                if (!isNavigating || !this.page) {
                    clearInterval(screenshotInterval);
                    return;
                }
                try {
                    const buffer = await this.page.screenshot({
                        fullPage: false,
                        type: "jpeg",
                        quality: 40,
                    });
                    const base64 = buffer.toString("base64");
                    await onLiveScreenshot?.(base64);
                } catch (err) {
                    console.log(
                        "[BrowserAdapter] Live screenshot capture failed (page may be closing)",
                    );
                }
            }, 500);

            try {
                await this.page.goto(url, {
                    waitUntil: "networkidle",
                });
                await this.waitPageCompletely(this.page);
            } catch (err) {
                console.log(
                    "[BrowserAdapter] Navigation timeout, proceeding...",
                );
            } finally {
                isNavigating = false;
                clearInterval(screenshotInterval);
            }
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    /**
     * Scrolls down by a specified number of pixels.
     */
    async scrollDown(pixels: number): Promise<void> {
        if (!this.page)
            throw new Error("Browser not initialized. Call navigateTo first.");
        console.log(`[BrowserAdapter] Scrolling down by ${pixels}px...`);
        await this.page.evaluate((px) => {
            window.scrollBy(0, px);
        }, pixels);
        // Brief wait for any lazy content
        await this.page.waitForTimeout(100);
    }

    /**
     * Scrolls the window to a specific Y-coordinate.
     */
    async scrollTo(y: number): Promise<void> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");
        console.log(`[BrowserAdapter] Scrolling to Y=${y}...`);
        await this.page.evaluate((targetY) => {
            window.scrollTo({ top: targetY, behavior: 'smooth' });
        }, y);
        // Wait for smooth scroll to settle
        await this.page.waitForTimeout(100);
    }

    /**
     * Gets the vertical Y-offset of an element on the page.
     */
    async getElementLocation(selector?: string, anchorText?: string): Promise<number | null> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");

        return await this.page.evaluate(({ sel, txt }) => {
            let element: Element | null = null;

            // 1. Try Selector
            if (sel) {
                try {
                    element = document.querySelector(sel);
                } catch (e) { }
            }

            // 2. Try Anchor Text (XPath)
            if (!element && txt) {
                // Case-insensitive contains text
                const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${txt.toLowerCase()}')]`;
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                element = result.singleNodeValue as Element;
            }

            if (element) {
                const rect = element.getBoundingClientRect();
                return window.scrollY + rect.top;
            }
            return null;
        }, { sel: selector, txt: anchorText });
    }

    /**
     * Captures only the current viewport.
     */
    async captureViewport(): Promise<string> {
        if (!this.page)
            throw new Error("Browser not initialized. Call navigateTo first.");
        const buffer = await this.page.screenshot({
            fullPage: false,
            type: "jpeg",
            quality: 40, // Lower quality for scout checks
        });
        return buffer.toString("base64");
    }

    /**
     * Captures a high-quality full-page screenshot.
     */
    async captureFullPage(): Promise<string> {
        if (!this.page) throw new Error("Browser not initialized.");

        console.log(`[BrowserAdapter] Capturing full-page screenshot...`);

        // Wait for stability one last time
        await this.waitPageCompletely(this.page);

        const buffer = await this.page.screenshot({
            fullPage: true,
            type: "jpeg",
            quality: 70 // Higher quality for the final analysis
        });

        return buffer.toString("base64");
    }

    /**
     * Gets a cleaned, textual representation of the full page.
     */
    async getCleanedHtml(): Promise<string> {
        if (!this.page)
            throw new Error("Browser not initialized. Call navigateTo first.");

        // Clean the DOM to only include meaningful text and basic structure
        // Using page.evaluateHandle + jsHandle to avoid __name issues
        try {
            const jsHandle = await this.page.evaluateHandle(function() {
                // Helper to check if an element is likely visible
                var isVisible = function(el: HTMLElement) {
                    var style = window.getComputedStyle(el);
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        el.offsetWidth > 0 &&
                        el.offsetHeight > 0
                    );
                };

                // Recursive cleaner
                function cleanNode(node: Node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.textContent ? node.textContent.trim() : "";
                    }

                    if (node.nodeType !== Node.ELEMENT_NODE) return "";

                    var el = node as HTMLElement;
                    var tag = el.tagName.toLowerCase();

                    // Skip noisy/invisible tags
                    var skipTags = ["script", "style", "noscript", "svg", "path", "canvas", "img", "iframe"];
                    if (skipTags.indexOf(tag) !== -1) return "";

                    if (!isVisible(el)) return "";

                    // For pricing, we care about headers, divs, spans, buttons, etc.
                    var childrenContent = "";
                    var childNodes = el.childNodes;
                    for (var i = 0; i < childNodes.length; i++) {
                        var content = cleanNode(childNodes[i]);
                        if (content) {
                            childrenContent += content + " ";
                        }
                    }

                    childrenContent = childrenContent.trim();
                    if (!childrenContent) return "";

                    // Wrap in tag for some structure if it's a "meaningful" container
                    var meaningfulTags = ["h1", "h2", "h3", "h4", "h5", "h6", "button", "a"];
                    if (meaningfulTags.indexOf(tag) !== -1) {
                        return "<" + tag + ">" + childrenContent + "</" + tag + ">";
                    }

                    return childrenContent;
                }

                return cleanNode(document.body);
            });
            return await jsHandle.jsonValue();
        } catch (error) {
            console.warn("[RemotePlaywrightAdapter] getCleanedHtml failed, returning empty string:", (error as Error).message);
            return "";
        }
    }

    /**
     * Closes the browser session.
     */
    async close(): Promise<void> {
        console.log(`[BrowserAdapter] Closing browser session...`);
        if (this.page) await this.page.close().catch(() => { });
        if (this.context) await this.context.close().catch(() => { });
        if (this.browser) await this.browser.close().catch(() => { });
        this.page = null;
        this.context = null;
        this.browser = null;
    }

    /**
     * Legacy method: Connects, navigates, screenshots, and cleans up.
     */
    async captureScreenshot(
        url: string,
        onProgress?: (
            status: "SETTING_UP" | "LOADING_WEBSITE" | "PROCESSING",
        ) => void,
    ): Promise<string> {
        try {
            await this.navigateTo(url, onProgress as any);
            if (!this.page) throw new Error("Navigation failed");

            onProgress?.("PROCESSING");
            await this.page.mouse.move(100, 100);
            await this.waitPageCompletely(this.page);
            // await this.waitForLoadersToDisappear(this.page);
            // await this.waitForImages(this.page);
            // await this.waitForDomStability(this.page, 10000);
            // await this.waitForFrameworkRendering(this.page);

            const buffer = await this.page.screenshot({
                fullPage: true,
                type: "jpeg",
                quality: 40,
            });

            return buffer.toString("base64");
        } finally {
            await this.close();
        }
    }

    async waitPageCompletely(page: Page): Promise<void> {
        // 1. Wait for the basic load
        await page.waitForLoadState("load");

        // 2. Wait for the network to settle (with a shorter timeout so it doesn't hang)
        await page
            .waitForLoadState("networkidle")
            .catch(() => console.log("Network didn't settle, continuing..."));

        // 3. Custom: Wait for no 'loading' text/spinners/skeletons to exist
        // Combine into one selector for efficiency
        const loaderSelector = [
            ':text-matches("loading", "i")',
            '[class*="skeleton"]',
            '[class*="shimmer"]',
            '[class*="loading-indicator"]'
        ].join(', ');

        await page.locator(loaderSelector).first().waitFor({ state: "hidden", timeout: 1500 }).catch(() => { });

        // Final "Settling" pause (the 250ms breather)
        // Essential for animations/transitions to finish before a screenshot
        await page.waitForTimeout(250);
    }

    /**
     * Polls the DOM for visual/structural stability.
     * If the node count and text length don't change for 1.5 seconds, we consider it stable.
     */
    private async waitForDomStability(
        page: Page,
        timeoutMs: number,
    ): Promise<void> {
        console.log(
            `[BrowserAdapter] Waiting for DOM stability (max ${timeoutMs}ms)...`,
        );
        try {
            await page.evaluate((timeout) => {
                return new Promise<void>((resolve) => {
                    const checkInterval = 500;
                    const stabilityThreshold = 3;
                    let stabilityCount = 0;
                    let lastState = "";
                    const startTime = Date.now();

                    const check = () => {
                        // Create a "signature" of the DOM: node count + innerText length
                        const currentState = `${document.querySelectorAll("*").length}-${document.body.innerText.length}`;

                        if (currentState === lastState) {
                            stabilityCount++;
                        } else {
                            stabilityCount = 0;
                            lastState = currentState;
                        }

                        if (stabilityCount >= stabilityThreshold) {
                            resolve();
                        } else if (Date.now() - startTime > timeout) {
                            console.log(
                                "[Stability Check] Reached timeout, continuing...",
                            );
                            resolve();
                        } else {
                            setTimeout(check, checkInterval);
                        }
                    };

                    check();
                });
            }, timeoutMs);
            console.log(`[BrowserAdapter] DOM stabilized.`);
        } catch (error) {
            console.log(
                `[BrowserAdapter] Stability check failed, continuing...`,
            );
        }
    }

    /**
     * Wait for all loading indicators to disappear
     */
    private async waitForLoadersToDisappear(page: Page): Promise<void> {
        try {
            const loaderSelectors = [
                '[role="progressbar"]',
                ".loader",
                ".loading",
                ".skeleton", // Common skeleton class
                ".shimmer",
                '[data-testid*="skeleton"]', // Udemy specific often
                '[class*="skeleton"]',
                '[class*="place-holder"]', // Common placeholder
                ".ud-skeleton", // Udemy specific check
            ];

            // Wait specifically for skeletons to be gone
            for (const selector of loaderSelectors) {
                // Determine if any such element exists and is visible
                const count = await page.locator(selector).count();
                if (count > 0) {
                    console.log(
                        `[BrowserAdapter] Waiting for ${selector} to disappear...`,
                    );
                    // Wait up to 5s for it to detach or hide
                    await page
                        .locator(selector)
                        .first()
                        .waitFor({ state: "hidden", timeout: 5000 })
                        .catch(() => { });
                }
            }

            console.log(`[BrowserAdapter] Loaders/Skeletons cleared.`);
        } catch (error) {
            console.log(
                `[BrowserAdapter] Loader wait timed out, continuing...`,
            );
        }
    }

    /**
     * Wait for JavaScript frameworks to finish rendering
     */
    private async waitForFrameworkRendering(page: Page): Promise<void> {
        try {
            // Wait for all framework-specific markers
            await page
                .evaluate(() => {
                    return new Promise<void>((resolve) => {
                        let attempts = 0;
                        const maxAttempts = 20;
                        const checkInterval = 200;

                        const checkReady = () => {
                            // Check document ready state
                            if (document.readyState !== "complete") {
                                if (attempts < maxAttempts) {
                                    attempts++;
                                    setTimeout(checkReady, checkInterval);
                                } else {
                                    resolve();
                                }
                                return;
                            }

                            // Check for React/Angular/Vue markers
                            const hasReact =
                                !!(window as any)
                                    .__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
                                !!(window as any).__NEXT_DATA__;
                            const hasAngular = !!(window as any).ng;
                            const hasVue = !!(window as any).__VUE__;

                            // If any framework is detected, wait for stability
                            if (hasReact || hasAngular || hasVue) {
                                // Wait for no pending layout/paint operations
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        setTimeout(resolve, 1500);
                                    });
                                });
                            } else {
                                setTimeout(resolve, 1500);
                            }
                        };

                        checkReady();
                    });
                })
                .catch(() => { });

            console.log(`[BrowserAdapter] Framework rendering complete.`);
        } catch (error) {
            console.log(
                `[BrowserAdapter] Framework wait timed out, continuing...`,
            );
        }
    }

    /**
     * Wait for images and lazy-loaded content.
     * Scrolls the page to the bottom SLOWLY to trigger lazy loading, then back up.
     */
    private async waitForImages(page: Page): Promise<void> {
        try {
            console.log(
                `[BrowserAdapter] Triggering lazy load via slow scroll...`,
            );

            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100; // Smaller chunks
                    const scrollDelay = 150; // Slower scroll

                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, scrollDelay);
                });
            });

            // Wait for stabilization
            await page.waitForTimeout(2000);

            console.log(`[BrowserAdapter] Scroll & Image wait complete.`);
        } catch (error) {
            console.log(`[BrowserAdapter] Image wait timed out, continuing...`);
        }
    }
}
