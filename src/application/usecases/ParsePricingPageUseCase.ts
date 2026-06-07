import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis, validatePricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

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

  async execute(
    url: string,
    personas: Persona[],
    onProgress?: (progress: PricingAnalysisProgress) => void,
    abortSignal?: AbortSignal,
    options: {
      nonStreamingAuditMode?: boolean;
      imageBase64?: string;
      tokenLimit?: number;
      runId?: string;
    } = {}
  ): Promise<PricingAnalysis[]> {
    const DEFAULT_TOKEN_LIMIT = 2000;
    const tokenLimit = options.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
    const nonStreamingAuditMode = options.nonStreamingAuditMode ?? false;
    const runId = options.runId || 'unknown';
    const log = AnalysisLogger.forRun(runId);
    const overallStartTime = Date.now();

    log.info("ParsePricingPageUseCase", "=== USE CASE EXECUTE START ===", {
      url,
      personaCount: personas.length,
      nonStreamingAuditMode,
      tokenLimit,
      hasImageBase64: !!options.imageBase64,
    });

    // 1. Capture screenshot of the pricing page with adaptive scouting
    log.info("ParsePricingPageUseCase", "Starting adaptive scouting phase", { url });

    let capturedScreenshot = '';
    let pageHtml = '';
    let lastScoutingViewport = '';
    let scoutingPhaseDuration = 0;

    if (options.imageBase64) {
      log.info("ParsePricingPageUseCase", "Skipping browser scouting, using provided image...");
      capturedScreenshot = options.imageBase64;
      lastScoutingViewport = options.imageBase64;
      onProgress?.({ step: 'THINKING' });
    } else {
      const scoutingStart = Date.now();
      try {
        // Initialize temp directory for live screenshots
        this.tempDir = path.join(os.tmpdir(), `pricing-live-${Date.now()}`);
        await fs.mkdir(this.tempDir, { recursive: true });
        log.info("ParsePricingPageUseCase", "Created temp dir for live screenshots", { tempDir: this.tempDir });

        // Check if already cancelled
        if (abortSignal?.aborted) {
          log.warn("ParsePricingPageUseCase", "Request cancelled before starting scouting");
          throw new Error('Request cancelled before starting');
        }

        log.info("ParsePricingPageUseCase", "Navigating to URL via browser service...");
        const navStart = Date.now();
        await this.browserService.navigateTo(
          url,
          (status) => {
            if (abortSignal?.aborted) return;
            log.trace("ParsePricingPageUseCase", "Navigation status update", { status });
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
            log.trace("ParsePricingPageUseCase", "Live screenshot captured during nav", {
              savedTo: screenshotPath,
              base64Length: liveScreenshotBase64.length,
            });
            onProgress?.({ step: 'OPENING_PAGE', screenshot: liveScreenshotBase64 });
          }
        );
        log.info("ParsePricingPageUseCase", `Navigation completed in ${Date.now() - navStart}ms`);

        // 1. Initial Viewport Capture (Baseline)
        log.info("ParsePricingPageUseCase", "Capturing initial viewport...");
        const viewportStart = Date.now();
        lastScoutingViewport = await this.browserService.captureViewport();
        log.info("ParsePricingPageUseCase", `Initial viewport captured (${lastScoutingViewport.length} base64 chars) in ${Date.now() - viewportStart}ms`);
        onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

        // 2. Get cleaned HTML for "Locator" strategy
        log.info("ParsePricingPageUseCase", "Getting cleaned HTML...");
        const htmlStart = Date.now();
        pageHtml = await this.browserService.getCleanedHtml();
        log.info("ParsePricingPageUseCase", `Cleaned HTML obtained (${pageHtml.length} chars) in ${Date.now() - htmlStart}ms`);

        log.info("ParsePricingPageUseCase", "Starting parallel HTML analysis: isPricingVisibleInHtml + summarizeHtml");
        const pricingLocationPromise = (this.llmService as any).isPricingVisibleInHtml(pageHtml, runId);
        const compactHtmlPromise = (this.llmService as any).summarizeHtml(pageHtml, runId);

        const pricingLocationStart = Date.now();
        const pricingLocation = await pricingLocationPromise;
        log.info("ParsePricingPageUseCase", `isPricingVisibleInHtml resolved in ${Date.now() - pricingLocationStart}ms`, {
          found: pricingLocation.found,
          selector: pricingLocation.selector || null,
          anchorText: pricingLocation.anchorText || null,
          reasoning: pricingLocation.reasoning,
        });

        let foundViaVision = false;

        // --- STRATEGY A: GUIDED STRIKE ---
        if (pricingLocation.found && (pricingLocation.selector || pricingLocation.anchorText)) {
          log.info("ParsePricingPageUseCase", `TARGETED STRIKE: ${pricingLocation.reasoning}`);
          log.info("ParsePricingPageUseCase", `Aiming for selector="${pricingLocation.selector}" anchorText="${pricingLocation.anchorText}"`);

          // A. Targeted Jump
          const elemLocStart = Date.now();
          const targetY = await this.browserService.getElementLocation(pricingLocation.selector, pricingLocation.anchorText);
          log.info("ParsePricingPageUseCase", `getElementLocation resolved in ${Date.now() - elemLocStart}ms: targetY=${targetY}`);

          if (targetY !== null) {
            // B. The Buffer Jump (1000px above)
            const bufferY = Math.max(0, targetY - 1000);
            log.info("ParsePricingPageUseCase", `Buffer jump to Y=${bufferY} (target was ${targetY})`);
            await this.browserService.scrollTo(bufferY);

            // C. The Stroll (Trigger lazy loads)
            log.info("ParsePricingPageUseCase", "Strolling to trigger lazy content (2x 500px scroll)...");
            const strollStart = Date.now();
            await this.browserService.scrollDown(500);
            await this.browserService.scrollDown(500);
            log.info("ParsePricingPageUseCase", `Stroll completed in ${Date.now() - strollStart}ms`);

            // B. Add small offset to center the pricing roughly
            const CENTER_OFFSET = 160;
            log.info("ParsePricingPageUseCase", `Centering with offset ${CENTER_OFFSET}px...`);
            await this.browserService.scrollDown(CENTER_OFFSET);

            // D. Vision Verification
            const verifyStart = Date.now();
            const viewportShot = await this.browserService.captureViewport();
            lastScoutingViewport = viewportShot;

            // Send live update
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewportShot });

            const SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE = true;
            const isHighConfidence = pricingLocation.selector?.startsWith('#') ||
              pricingLocation.selector?.toLowerCase().includes('pricing') ||
              pricingLocation.anchorText?.toLowerCase().includes('pricing');

            if (isHighConfidence && SKIP_VISION_VERIFY_ON_HIGH_CONFIDENCE) {
              log.info("ParsePricingPageUseCase", "HIGH CONFIDENCE HTML target. Skipping vision verification.");
              foundViaVision = true;
            } else {
              const visionCheckStart = Date.now();
              foundViaVision = await (this.llmService as any).isPricingVisible(viewportShot, runId);
              log.info("ParsePricingPageUseCase", `Vision verification completed in ${Date.now() - visionCheckStart}ms: ${foundViaVision ? 'POSITIVE' : 'NEGATIVE'}`);
            }
            log.info("ParsePricingPageUseCase", `Targeted strike verification took ${Date.now() - verifyStart}ms`);
          } else {
            log.warn("ParsePricingPageUseCase", "Target element not found in DOM. Falling through to linear scan.");
          }
        } else {
          log.info("ParsePricingPageUseCase", "No specific target found in HTML analysis. Proceeding to linear scan fallback.");
        }

        // --- STRATEGY B: FALLBACK LINEAR SCAN ---
        if (!foundViaVision) {
          log.info("ParsePricingPageUseCase", "Starting LINEAR SCROLL SCAN (fallback strategy)");
          // Reset to top to start clean
          await this.browserService.scrollTo(0);

          const MAX_SCROLLS = 8;
          const SCROLL_AMOUNT = 800;
          const CENTER_OFFSET = 160;

          for (let i = 0; i < MAX_SCROLLS; i++) {
            log.info("ParsePricingPageUseCase", `Linear scan step ${i + 1}/${MAX_SCROLLS}: capturing viewport...`);
            const viewport = await this.browserService.captureViewport();
            lastScoutingViewport = viewport;
            onProgress?.({ step: 'FINDING_PRICING', screenshot: viewport });

            // Check vision
            const scanCheckStart = Date.now();
            const isVisible = await (this.llmService as any).isPricingVisible(viewport, runId);
            log.info("ParsePricingPageUseCase", `Linear scan step ${i + 1}: isPricingVisible=${isVisible} (took ${Date.now() - scanCheckStart}ms)`);

            if (isVisible) {
              foundViaVision = true;
              log.info("ParsePricingPageUseCase", `FOUND pricing via linear scan at step ${i + 1}`);

              // Scroll a bit more to center the pricing for the final analysis screenshot
              log.info("ParsePricingPageUseCase", "Centering pricing for final capture...");
              await this.browserService.scrollDown(CENTER_OFFSET);
              lastScoutingViewport = await this.browserService.captureViewport();
              onProgress?.({ step: 'FINDING_PRICING', screenshot: lastScoutingViewport });

              break;
            }

            // Scroll
            log.trace("ParsePricingPageUseCase", `Scrolling down ${SCROLL_AMOUNT}px...`);
            await this.browserService.scrollDown(SCROLL_AMOUNT);
          }

          if (!foundViaVision) {
            log.warn("ParsePricingPageUseCase", `Pricing NOT found after ${MAX_SCROLLS} linear scrolls. Using last viewport.`);
          }
        }

        // 4. Resolve HTML summarization that ran concurrently
        log.info("ParsePricingPageUseCase", "Awaiting concurrent HTML compaction...");
        const compactStart = Date.now();
        const compactedHtml = await compactHtmlPromise;
        log.info("ParsePricingPageUseCase", `HTML compaction resolved in ${Date.now() - compactStart}ms (${compactedHtml?.length || 0} chars)`);

        // Use the last targeted viewport instead of full page
        capturedScreenshot = lastScoutingViewport;
        pageHtml = compactedHtml;

        scoutingPhaseDuration = Date.now() - scoutingStart;
        log.info("ParsePricingPageUseCase", `SCOUTING PHASE COMPLETE (${scoutingPhaseDuration}ms)`, {
          foundViaVision,
          finalScreenshotLength: capturedScreenshot?.length || 0,
          compactedHtmlLength: compactedHtml?.length || 0,
          strategiesUsed: foundViaVision ? (pricingLocation.found ? 'targeted_strike' : 'linear_scan') : 'failed_both',
        });

      } finally {
        // Ensure browser is closed even if scouting fails
        await this.browserService.close();

        // Clean up temp directory
        if (this.tempDir) {
          await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => { });
          log.trace("ParsePricingPageUseCase", "Cleaned up temp dir");
        }
      }
    }

    // Check if cancelled before persona analysis
    if (abortSignal?.aborted) {
      log.warn("ParsePricingPageUseCase", "Request cancelled before persona analysis phase");
      throw new Error('Request cancelled before persona analysis');
    }

    // 2. Analyze the pricing page from each persona's perspective (Parallelized queue)
    const personaPhaseStart = Date.now();
    log.info("ParsePricingPageUseCase", `=== PERSONA ANALYSIS PHASE START === (${personas.length} personas)`);

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(5);

    let finishedCount = 0;
    const totalCount = personas.length;

    log.info("ParsePricingPageUseCase", `Scouting complete. Starting persona analysis with concurrency=5 for ${totalCount} personas.`);

    // Initial broadcast
    onProgress?.({
      step: 'THINKING',
      totalCount,
      completedCount: 0
    });

    const analyses: PricingAnalysis[] = await Promise.all(
      personas.map((persona, index) => limit(async () => {
        const personaStartTime = Date.now();
        const personaIndex = index;

        // Check if cancelled before persona analysis
        if (abortSignal?.aborted) {
          log.warn("ParsePricingPageUseCase", `Persona ${personaIndex} cancelled before start`);
          throw new Error('Request cancelled during persona analysis');
        }

        // Progress & logging
        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        log.info("ParsePricingPageUseCase", `[Persona ${personaIndex + 1}/${totalCount}] ENTERING analysis slot`, {
          name: persona.name,
          id: persona.id,
          occupation: persona.occupation,
          pricingSensitivity: persona.pricingSensitivity,
          typicalBudget: persona.typicalBudget,
          bigFive: {
            conscientiousness: persona.conscientiousness,
            neuroticism: persona.neuroticism,
            openness: persona.openness,
            extraversion: persona.extraversion,
            agreeableness: persona.agreeableness,
          },
          backstoryLength: persona.backstory?.length || 0,
        });

        log.info("ParsePricingPageUseCase", `[${persona.name}] Analyzing with compacted HTML (${pageHtml?.length || 0} chars) and viewport screenshot (${capturedScreenshot?.length || 0} base64 chars)`);

        let analysisObj: any;
        let lastThoughts = "";

        if (nonStreamingAuditMode) {
          // --- AUDIT/Non-Streaming CODE PATH ---
          try {
            log.info("ParsePricingPageUseCase", `[${persona.name}] Starting NON-STREAMING (audit) analysis...`);
            const auditStart = Date.now();
            analysisObj = await (this.llmService as any).analyzePricingPageCompletion(
              persona, capturedScreenshot, pageHtml, { tokenLimit, runId }
            );
            const auditDuration = Date.now() - auditStart;
            log.info("ParsePricingPageUseCase", `[${persona.name}] AUDIT analysis completed in ${auditDuration}ms`);
            log.debug("ParsePricingPageUseCase", `[${persona.name}] AUDIT result`, {
              hasGutReaction: !!analysisObj?.gutReaction,
              scoreKeys: analysisObj?.scores ? Object.keys(analysisObj.scores) : null,
              riskCount: analysisObj?.risks?.length || 0,
            });
          } catch (err) {
            log.error("ParsePricingPageUseCase", `[${persona.name}] Unexpected error in audit mode`, { error: String(err) });
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
            log.info("ParsePricingPageUseCase", `[${persona.name}] Starting STREAMING analysis...`);
            const streamCallStart = Date.now();
            const result = await (this.llmService as any).analyzePricingPageStream(
              persona, capturedScreenshot, pageHtml, { tokenLimit, runId }
            );
            const streamCallDuration = Date.now() - streamCallStart;
            log.info("ParsePricingPageUseCase", `[${persona.name}] analyzePricingPageStream returned in ${streamCallDuration}ms`);

            // Set a timeout for the entire persona analysis to prevent indefinite hangs
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                log.warn("ParsePricingPageUseCase", `[${persona.name}] TIMEOUT fired after 180s`);
                reject(new Error(`Timeout: Analysis for ${persona.name} took too long`));
              }, 180000);
            });

            const streamPromise = (async () => {
              let chunkCount = 0;
              let emergencyBreak = false;
              let lastPartial: any = {};

              log.info("ParsePricingPageUseCase", `[${persona.name}] Starting partialObjectStream iteration...`);
              const streamIterStart = Date.now();

              for await (const partial of (result as unknown as { partialObjectStream: AsyncIterable<any> }).partialObjectStream) {
                if (abortSignal?.aborted) throw new Error('Request cancelled during persona analysis');

                chunkCount++;
                lastPartial = partial;

                // More generous character threshold
                const charThreshold = tokenLimit * 10;

                // Emergency break: If a single persona generates too much data
                if (chunkCount > 5000 || lastThoughts.length > charThreshold) {
                  log.warn("ParsePricingPageUseCase", `[${persona.name}] Emergency break triggered`, {
                    chunkCount,
                    thoughtsLength: lastThoughts.length,
                    threshold: charThreshold,
                  });
                  emergencyBreak = true;
                  break;
                }

                // Periodic heartbeat log
                if (chunkCount % 25 === 0) {
                  log.info("ParsePricingPageUseCase", `[${persona.name}] Stream progress`, {
                    chunkCount,
                    fields: Object.keys(partial).join(', '),
                    elapsed: Date.now() - personaStartTime,
                  });
                } else if (chunkCount % 5 === 0) {
                  log.trace("ParsePricingPageUseCase", `[${persona.name}] Chunk #${chunkCount} received`, {
                    fields: Object.keys(partial),
                  });
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

              const streamIterDuration = Date.now() - streamIterStart;
              log.info("ParsePricingPageUseCase", `[${persona.name}] Stream iteration completed`, {
                chunkCount,
                emergencyBreak,
                streamIterDurationMs: streamIterDuration,
              });

              if (emergencyBreak) {
                log.info("ParsePricingPageUseCase", `[${persona.name}] Returning partial analysis due to emergency break`);
                log.debug("ParsePricingPageUseCase", `[${persona.name}] Partial result fields`, { fields: Object.keys(lastPartial) });
                return lastPartial;
              }

              log.info("ParsePricingPageUseCase", `[${persona.name}] Stream finished. Resolving full object...`);
              const fullObjectStart = Date.now();
              const fullObject = await (result as any).object;
              const fullObjectDuration = Date.now() - fullObjectStart;
              log.info("ParsePricingPageUseCase", `[${persona.name}] Full object resolved in ${fullObjectDuration}ms`);

              if (fullObject) {
                log.info("ParsePricingPageUseCase", `[${persona.name}] ANALYSIS RESULT`, {
                  gutReaction: fullObject.gutReaction?.slice(0, 150),
                  scores: fullObject.scores ? {
                    clarity: fullObject.scores.clarity,
                    valuePerception: fullObject.scores.valuePerception,
                    trust: fullObject.scores.trust,
                    explorationIntent: fullObject.scores.explorationIntent,
                    analysisIntent: fullObject.scores.analysisIntent,
                    buyIntent: fullObject.scores.buyIntent,
                  } : null,
                  risks: fullObject.risks,
                  recommendationCount: fullObject.recommendations?.length || 0,
                  thoughtsLength: fullObject.thoughts?.length || 0,
                });
              } else {
                log.warn("ParsePricingPageUseCase", `[${persona.name}] Full object was null/undefined`);
              }
              return fullObject;
            })();

            log.info("ParsePricingPageUseCase", `[${persona.name}] Racing streamPromise vs timeout...`);
            analysisObj = await Promise.race([streamPromise, timeoutPromise]);
            log.info("ParsePricingPageUseCase", `[${persona.name}] RACE won`);
          } catch (e) {
            const errMsg = (e as Error)?.message || String(e);
            log.error("ParsePricingPageUseCase", `[${persona.name}] CAUGHT error in streaming analysis`, {
              error: errMsg,
              elapsedMs: Date.now() - personaStartTime,
            });
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
        const personaDuration = Date.now() - personaStartTime;
        log.recordPersonaLatency(persona.name, personaDuration);
        log.info("ParsePricingPageUseCase", `[${persona.name}] COMPLETED in ${personaDuration}ms (finishedCount=${finishedCount}/${totalCount})`);

        onProgress?.({
          step: 'THINKING',
          personaName: persona.name,
          totalCount,
          completedCount: finishedCount
        });

        // Add metadata and IDs
        const fullAnalysis: PricingAnalysis = {
          ...analysisObj,
          rawAnalysis: lastThoughts,
          id: `${persona.name.replace(/[\s-]+/g, '_')}-${Date.now()}`,
          url,
          screenshotBase64: lastScoutingViewport || capturedScreenshot,
        };

        // Validate
        if (!validatePricingAnalysis(fullAnalysis)) {
          log.warn("ParsePricingPageUseCase", `[${persona.name}] Validation FAILED for analysis`, {
            hasId: !!fullAnalysis.id,
            hasUrl: !!fullAnalysis.url,
            hasScreenshot: !!fullAnalysis.screenshotBase64,
            hasThoughts: !!fullAnalysis.thoughts,
            hasScores: !!fullAnalysis.scores,
            hasRisks: Array.isArray(fullAnalysis.risks),
            hasRecommendations: Array.isArray(fullAnalysis.recommendations),
            hasAiSuggestion: !!fullAnalysis.aiSuggestion,
          });
          // fallback to ensure it doesn't crash the whole process
          fullAnalysis.id = fullAnalysis.id || `${persona.name.replace(/[\s-]+/g, '_')}-${Date.now()}`;
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
        } else {
          log.info("ParsePricingPageUseCase", `[${persona.name}] Validation PASSED`);
        }

        // Enrich with persona profile data (presentation layer only)
        fullAnalysis.personaProfile = {
          name: persona.name,
          occupation: persona.occupation,
          bigFive: {
            conscientiousness: persona.conscientiousness,
            neuroticism: persona.neuroticism,
            openness: persona.openness,
            extraversion: persona.extraversion,
            agreeableness: persona.agreeableness,
          },
          values: persona.values ? [...persona.values] : [],
          fears: persona.fears ? [...persona.fears] : [],
          communicationStyle: persona.communicationStyle ?? "",
          pricingSensitivity: persona.pricingSensitivity ?? 50,
          typicalBudget: persona.typicalBudget ?? "",
        };
        fullAnalysis.personaId = persona.id;

        return fullAnalysis;
      }))
    );

    const personaPhaseDuration = Date.now() - personaPhaseStart;
    const totalDuration = Date.now() - overallStartTime;

    log.info("ParsePricingPageUseCase", `=== PERSONA ANALYSIS PHASE COMPLETE ===`, {
      personaPhaseDurationMs: personaPhaseDuration,
      totalDurationMs: totalDuration,
      analysisCount: analyses.length,
      successCount: analyses.filter(a => !a.thoughts?.includes('error') && !a.thoughts?.includes('failed')).length,
    });

    log.info("ParsePricingPageUseCase", "=== USE CASE EXECUTE END ===");

    // Log persona latencies summary
    log.logPersonaSummary();

    return analyses;
  }
}
