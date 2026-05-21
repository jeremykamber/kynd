import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis, validatePricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { stripCodeFence, extractJson } from "@/infrastructure/adapters/llmUtils";

export type PricingAnalysisProgressStep =
  | 'STARTING'
  | 'OPENING_PAGE'
  | 'FINDING_PRICING'
  | 'THINKING';

export interface PricingAnalysisProgress {
  step: PricingAnalysisProgressStep;
  screenshot?: string;
  personaName?: string;
  completedCount?: number;
  totalCount?: number;
  analysisToken?: string;
}

export class ParsePricingPageUseCase {
  private tempDir: string | null = null;
  private lastTempScreenshotPath: string | null = null;

  constructor(
    private readonly browserService: BrowserServicePort,
    private readonly llmService: LlmServicePort
  ) { }

  /**
   * Pricing audit/analysis use case — supports both streaming and non-streaming persona analysis.
   * By default, streams partial thoughts. For pricing audit, disables streaming for full, clean completion per persona.
   */
  /**
   * Main pricing audit (and persona analysis) use case. If nonStreamingAuditMode is true,
   * disables streaming and uses completion-based audit per persona with robust fallback/error handling.
   * Otherwise uses streaming for persona analysis.
   */
  async execute(
    url: string,
    personas: Persona[],
    onProgress?: (progress: PricingAnalysisProgress) => void,
    abortSignal?: AbortSignal,
    options: {
      nonStreamingAuditMode?: boolean;
      imageBase64?: string;
      tokenLimit?: number;
    } = {}
  ): Promise<PricingAnalysis[]> {
    const DEFAULT_TOKEN_LIMIT = 2000;
    const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
    const nonStreamingAuditMode = options.nonStreamingAuditMode ?? false;

    // 1. Capture screenshot of the pricing page with adaptive scouting
    console.log(`[ParsePricingPageUseCase] Starting adaptive scouting for ${url}...`);

    let capturedScreenshot = '';
    let pageHtml = '';
    let lastScoutingViewport = '';

    if (options.imageBase64) {
      console.log(`[ParsePricingPageUseCase] Skipping browser scouting, using provided image...`);
      capturedScreenshot = options.imageBase64;
      lastScoutingViewport = options.imageBase64;
      onProgress?.({ step: 'THINKING' });
    } else {
      try {
        // Initialize temp directory for live screenshots
        this.tempDir = path.join(os.tmpdir(), `pricing-live-${Date.now()}`);
        await fs.mkdir(this.tempDir, { recursive: true });
        console.log(`[ParsePricingPageUseCase] Created temp dir: ${this.tempDir}`);

        // Check if already cancelled
        if (abortSignal?.aborted) {
          throw new Error('Request cancelled before starting');
        }

        await this.browserService.navigateTo(
          url,
          (status) => {
            if (abortSignal?.aborted) return;
            if (status === 'SETTING_UP') onProgress?.({ step: 'STARTING' });
            if (status === 'LOADING_WEBSITE') onProgress?.({ step: 'OPENING_PAGE' });
          },
          async (liveScreenshotBase64) => {
            if (abortSignal?.aborted) return;
            // Handle live screenshot: save to temp file and notify
            const screenshotPath = path.join(this.tempDir!, `live-${Date.now()}.jpg`);
            const buffer = Buffer.from(liveScreenshotBase64, 'base64');
            await fs.writeFile(screenshotPath, buffer);

            // Delete previous temp screenshot
            if (this.lastTempScreenshotPath) {
              await fs.unlink(this.lastTempScreenshotPath).catch(() => { });
            }

            this.lastTempScreenshotPath = screenshotPath;
            onProgress?.({ step: 'OPENING_PAGE', screenshot: liveScreenshotBase64 });
          }
        );

        // 1. Initial Viewport Capture (Baseline)
        console.log(`[ParsePricingPageUseCase] Capturing initial viewport...`);
        lastScoutingViewport = await this.browserService.captureViewport();
        onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

        // 2. Get cleaned HTML for "Locator" strategy
        pageHtml = await this.browserService.getCleanedHtml();

        // 3. Start HTML compacting and Pricing Location search concurrently
        onProgress?.({ step: 'THINKING' });
        const pricingLocationPromise = this.llmService.isPricingVisibleInHtml(pageHtml);
        const compactHtmlPromise = this.llmService.summarizeHtml(pageHtml);

        const pricingLocation = await pricingLocationPromise;
        let foundViaVision = false;

        // --- STRATEGY A: GUIDED STRIKE ---
        if (pricingLocation.found && (pricingLocation.selector || pricingLocation.anchorText)) {
          console.log(`[ParsePricingPageUseCase] 🎯 Targeted Strike: ${pricingLocation.reasoning}`);
          console.log(`[ParsePricingPageUseCase] Aiming for: ${pricingLocation.selector || pricingLocation.anchorText}`);

          // A. Targeted Jump
          const targetY = await this.browserService.getElementLocation(pricingLocation.selector, pricingLocation.anchorText);

          if (targetY !== null) {
            // B. The Buffer Jump (1000px above)
            const bufferY = Math.max(0, targetY - 1000);
            console.log(`[ParsePricingPageUseCase] Jumping to Y=${bufferY} (Target: ${targetY})`);
            await this.browserService.scrollTo(bufferY);

            // C. The Stroll (Trigger lazy loads)
            console.log(`[ParsePricingPageUseCase] Strolling to trigger lazy content...`);
            await this.browserService.scrollDown(500);
            await this.browserService.scrollDown(500);

            // B. Add small offset to center the pricing roughly
            const CENTER_OFFSET = 160; // 20% of 800px viewport
            console.log(`[ParsePricingPageUseCase] Centering pricing viewport...`);
            await this.browserService.scrollDown(CENTER_OFFSET);

            // D. Vision Verification
            const viewportShot = await this.browserService.captureViewport();
            lastScoutingViewport = viewportShot;

            // Send live update
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewportShot });

            const SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE = true;
            const isHighConfidence = pricingLocation.selector?.startsWith('#') ||
              pricingLocation.selector?.toLowerCase().includes('pricing') ||
              pricingLocation.anchorText?.toLowerCase().includes('pricing');

            if (isHighConfidence && SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE) {
              console.log(`[ParsePricingPageUseCase] High confidence HTML target. Skipping vision verification.`);
              foundViaVision = true;
            } else {
              foundViaVision = await this.llmService.isPricingVisible(viewportShot);
              console.log(`[ParsePricingPageUseCase] Vision Confirmation: ${foundViaVision ? 'POSITIVE' : 'NEGATIVE'}`);
            }
          } else {
            console.warn(`[ParsePricingPageUseCase] Target element not found in DOM.`);
          }
        } else {
          console.log(`[ParsePricingPageUseCase] No specific target found in HTML. Proceeding to fallback.`);
        }

        // --- STRATEGY B: FALLBACK LINEAR SCAN ---
        if (!foundViaVision) {
          console.log(`[ParsePricingPageUseCase] 🔄 Starting Linear Scroll Scan...`);
          // Reset to top to start clean
          await this.browserService.scrollTo(0);

          const MAX_SCROLLS = 8;
          const SCROLL_AMOUNT = 800;
          const CENTER_OFFSET = 160; // 20% of 800px viewport

          for (let i = 0; i < MAX_SCROLLS; i++) {
            const viewport = await this.browserService.captureViewport();
            lastScoutingViewport = viewport;
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewport });

            // Check vision
            const isVisible = await this.llmService.isPricingVisible(viewport);
            if (isVisible) {
              foundViaVision = true;
              console.log(`[ParsePricingPageUseCase] Found pricing via linear scan at step ${i}`);

              // Scroll a bit more to center the pricing for the final analysis screenshot
              console.log(`[ParsePricingPageUseCase] Centering pricing for final capture...`);
              await this.browserService.scrollDown(CENTER_OFFSET);
              lastScoutingViewport = await this.browserService.captureViewport();
              onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

              break;
            }

            // Scroll
            await this.browserService.scrollDown(SCROLL_AMOUNT);
          }
        }

        // 4. Resolve HTML summarization that ran concurrently
        console.log(`[ParsePricingPageUseCase] Awaiting concurrent HTML Compacting...`);
        const compactedHtml = await compactHtmlPromise;
        console.log(`[ParsePricingPageUseCase] HTML Compacting complete.`);

        // Use the last targeted viewport instead of full page
        capturedScreenshot = lastScoutingViewport;
        pageHtml = compactedHtml; // Replace the raw HTML with the summary for downstream analysis

      } finally {
        // Ensure browser is closed even if scouting fails
        await this.browserService.close();

        // Clean up temp directory
        if (this.tempDir) {
          await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => { });
          console.log(`[ParsePricingPageUseCase] Cleaned up temp dir: ${this.tempDir}`);
        }
      }
    }

    // Check if cancelled before persona analysis
    if (abortSignal?.aborted) {
      throw new Error('Request cancelled before persona analysis');
    }

    // 2. Analyze the pricing page from each persona's perspective (Parallelized queue)
    console.log(`[ParsePricingPageUseCase] Analyzing from ${personas.length} personas...`);

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(5); // Increased to 5 to run personas concurrently for speed

    let finishedCount = 0;
    const totalCount = personas.length;

    // Initial broadcast
    onProgress?.({
      step: 'THINKING',
      totalCount,
      completedCount: 0
    });

    const analyses: PricingAnalysis[] = await Promise.all(
      personas.map((persona, index) => limit(async () => {
        // Check if cancelled before persona analysis
        if (abortSignal?.aborted) {
          throw new Error('Request cancelled during persona analysis');
        }

        // Removed staggered delay to improve concurrency speed

        // Progress & logging
        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        console.log(`[ParsePricingPageUseCase] Persona ${persona.name}: Analyzing with Compacted HTML (${pageHtml?.length || 0} chars) and Viewport Screenshot.`);

        let analysisObj: any;
        let lastThoughts = "";

        if (nonStreamingAuditMode) {
          // --- AUDIT/Non-Streaming CODE PATH ---
          try {
            console.log(`[ParsePricingPageUseCase] [AUDIT] Starting non-streaming audit for persona: ${persona.name}`);
            analysisObj = await (this.llmService as any).analyzePricingPageCompletion(
              persona, capturedScreenshot, pageHtml, { tokenLimit }
            );
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[ParsePricingPageUseCase] [AUDIT] Audit analysis complete for: ${persona.name}`, analysisObj);
            }
          } catch (err) {
            // Defensive fallback handled in adapter already; but catch unexpected errors here
            if (process.env.NODE_ENV !== 'production') {
              console.error(`[ParsePricingPageUseCase] [AUDIT] Unexpected error in persona: ${persona.name}`, err);
            }
            analysisObj = {
              gutReaction: "Overall, this audit could not be completed due to a system issue.",
              thoughts: "An error occurred during pricing analysis.",
              scores: {
                clarity: 1, clarityReason: "System error.",
                valuePerception: 1, valuePerceptionReason: "System error.",
                trust: 1, trustReason: "System error.",
                explorationIntent: 1, explorationIntentReason: "System error.",
                analysisIntent: 1, analysisIntentReason: "System error.",
                buyIntent: 1, buyIntentReason: "System error.",
              },
              risks: ["[SYSTEM] LLM completion or analysis failed"],
              recommendations: [],
              aiSuggestion: "System error — analysis could not be completed.",
            };
          }

        } else {
          // --- STREAMING/PERSONA CODE PATH ---
          try {
            console.log(`[ParsePricingPageUseCase] Starting streaming analysis for persona: ${persona.name}...`);
            const result = await (this.llmService as any).analyzePricingPageStream(
              persona, capturedScreenshot, pageHtml, { tokenLimit }
            );

            // Set a timeout for the entire persona analysis to prevent indefinite hangs
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`Timeout: Analysis for ${persona.name} took too long`)), 180000); // 3 minute timeout (tripled)
            });

            const streamPromise = (async () => {
              let chunkCount = 0;
              let lastDataTime = Date.now();

              for await (const partial of (result as any).partialObjectStream) {
                if (abortSignal?.aborted) throw new Error('Request cancelled during persona analysis');

                chunkCount++;
                lastDataTime = Date.now();

                // Character threshold roughly from tokens (4:1 ratio)
                const charThreshold = tokenLimit * 4;

                // Emergency break: If a single persona generates too much data, it's likely a runaway loop
                if (chunkCount > 3000 || lastThoughts.length > charThreshold) {
                  console.error(`[ParsePricingPageUseCase] Persona ${persona.name}: Emergency break triggered due to excessive data (${chunkCount} chunks, ${lastThoughts.length} chars). Threshold: ${charThreshold}`);
                  break;
                }

                // Periodic heartbeat log
                if (chunkCount % 25 === 0) {
                  console.log(`[ParsePricingPageUseCase] Persona ${persona.name}: Total chunks so far: ${chunkCount}. (Fields present: ${Object.keys(partial).join(', ')})`);
                }

                if (partial.thoughts) {
                  const delta = partial.thoughts.slice(lastThoughts.length);
                  if (delta) {
                    onProgress?.({
                      step: 'THINKING',
                      personaName: persona.name,
                      totalCount,
                      completedCount: finishedCount,
                      analysisToken: delta
                    });
                    lastThoughts = partial.thoughts;
                  }
                }
              }
              console.log(`[ParsePricingPageUseCase] Persona ${persona.name}: Stream finished after ${chunkCount} chunks. Waiting for full object...`);
              const fullObject = await (result as any).object;
              if (fullObject) {
                console.log(`[ParsePricingPageUseCase] === ANALYSIS RESULT FOR ${persona.name} ===`);
                console.log(`[ParsePricingPageUseCase] Gut: "${fullObject.gutReaction}"`);
                console.log(`[ParsePricingPageUseCase] Scores: Clarity=${fullObject.scores?.clarity}, Value=${fullObject.scores?.valuePerception}, Trust=${fullObject.scores?.trust}, BuyIntent=${fullObject.scores?.buyIntent}`);
                console.log(`[ParsePricingPageUseCase] Risks: ${JSON.stringify(fullObject.risks)}`);
                console.log(`[ParsePricingPageUseCase] Thoughts (first 300): ${(fullObject.thoughts ?? "").slice(0, 300)}...`);
                console.log(`[ParsePricingPageUseCase] === END ANALYSIS FOR ${persona.name} ===`);
              }
              return fullObject;
            })();

            analysisObj = await Promise.race([streamPromise, timeoutPromise]);
          } catch (e) {
            // Improved, atomic error handling for one persona only
            if (process.env.NODE_ENV !== 'production') {
              console.error(`[ParsePricingPageUseCase] Streaming analysis failed for persona ${persona.name}:`, e);
            }
            analysisObj = {
              gutReaction: "Honestly, I'm having a hard time focusing on this right now.",
              thoughts: "The analysis failed to complete properly.",
              scores: {
                clarity: 1, clarityReason: "Analysis error.",
                valuePerception: 1, valuePerceptionReason: "Analysis error.",
                trust: 1, trustReason: "Analysis error.",
                explorationIntent: 1, explorationIntentReason: "Analysis error.",
                analysisIntent: 1, analysisIntentReason: "Analysis error.",
                buyIntent: 1, buyIntentReason: "Analysis error.",
              },
              risks: ["[SYSTEM] Technical difficulty during analysis"],
              recommendations: [],
              aiSuggestion: "Analysis could not be completed — no suggestion available.",
            };
          }
        }

        if (abortSignal?.aborted) throw new Error('Request cancelled during persona analysis');

        finishedCount++;
        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        // Add metadata and IDs
        const fullAnalysis: PricingAnalysis = {
          ...analysisObj,
          rawAnalysis: lastThoughts, // Only for streaming mode; in audit mode, typically empty.
          id: `${persona.id}-${Date.now()}`,
          url,
          screenshotBase64: lastScoutingViewport || capturedScreenshot, // Use the targeted viewport for UI, fallback to full page if needed
        };

        // Validate
        if (!validatePricingAnalysis(fullAnalysis)) {
          console.error(`[ParsePricingPageUseCase] Validation failed for persona ${persona.name}.`, JSON.stringify(fullAnalysis, null, 2));
          // fallback to ensure it doesn't crash the whole process
          fullAnalysis.id = fullAnalysis.id || `${persona.id}-${Date.now()}`;
          fullAnalysis.url = fullAnalysis.url || url;
          fullAnalysis.screenshotBase64 = fullAnalysis.screenshotBase64 || capturedScreenshot;
          fullAnalysis.thoughts = fullAnalysis.thoughts || "Analysis validation failed.";
          fullAnalysis.scores = fullAnalysis.scores || {
      clarity: 1, clarityReason: "Default fallback.",
      valuePerception: 1, valuePerceptionReason: "Default fallback.",
      trust: 1, trustReason: "Default fallback.",
      explorationIntent: 1, explorationIntentReason: "Default fallback.",
      analysisIntent: 1, analysisIntentReason: "Default fallback.",
      buyIntent: 1, buyIntentReason: "Default fallback.",
    };
          fullAnalysis.risks = fullAnalysis.risks || [];
    fullAnalysis.aiSuggestion = fullAnalysis.aiSuggestion || "No AI suggestion available.";
        }

        return fullAnalysis;
      }))
    );

    return analyses;
  }
}
