"use server";
import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { ParsePricingPageUseCase } from "@/application/usecases/ParsePricingPageUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import { simulationResultStore } from "@/infrastructure/SimulationResultStore";
import { storeScreenshot } from "./getScreenshot";
import { storeProgress, storeCompleted } from "./getProgress";

// ── Guard: run locally or delegate to VPS? ──────────────────
const SHOULD_RUN_LOCALLY = process.env.NODE_ENV === "development" || process.env.IS_VPS === "true";
const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL || "http://localhost:8080";
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN || "";

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const auditRateLimiter = new RateLimiterMemory({
    keyPrefix: 'audit',
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

const rawPersonaTokenLimit = parseInt(process.env.PERSONA_TOKEN_LIMIT || '2000', 10);
const PERSONA_TOKEN_LIMIT = Number.isFinite(rawPersonaTokenLimit) && rawPersonaTokenLimit > 0
    ? rawPersonaTokenLimit
    : 2000;

export async function analyzePricingPageAction(
    url: string,
    personas: Persona[],
    requestId?: string,
    imageBase64?: string,
) {
    if (SHOULD_RUN_LOCALLY) {
        return runLocally(url, personas, requestId, imageBase64);
    }
    return runRemote(url, personas, requestId, imageBase64);
}

async function runLocally(
    url: string,
    personas: Persona[],
    requestId?: string,
    imageBase64?: string,
) {
    const id = requestId || `pricing-${Date.now()}`;
    const actionStartTime = Date.now();

    // ── Initialize per-run logger ────────────────────────────────────────
    const log = AnalysisLogger.forRun(id);
    await log.init();
    log.info("analyzePricingPageAction", "=== ACTION START ===", {
        url,
        personaCount: personas.length,
        personaNames: personas.map((p) => p.name),
        hasImage: !!imageBase64,
        requestId: id,
    });

    const abortController = cancellationManager.createRequest(id);
    const abortSignal = abortController.signal;
    const stream = createStreamableValue<any>({ step: "STARTING", requestId: id });

    // Log persona details for tracing
    personas.forEach((p, i) => {
        log.info("analyzePricingPageAction", `Persona[${i}]`, {
            id: p.id,
            name: p.name,
            occupation: p.occupation,
            pricingSensitivity: p.pricingSensitivity,
            typicalBudget: p.typicalBudget,
        });
    });

    // Get client IP for rate limiting
    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
        log.info("analyzePricingPageAction", "Client IP resolved", { clientIP });
    } catch (e) {
        log.warn("analyzePricingPageAction", "Failed to resolve client IP, using 'unknown'", { error: String(e) });
    }

    // Check rate limit
    try {
        await auditRateLimiter.consume(clientIP);
        log.info("analyzePricingPageAction", "Rate limit check passed", { clientIP });
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        log.warn("analyzePricingPageAction", "Rate limit exceeded", { clientIP, retryAfter });
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`, requestId: id });
        await log.close();
        AnalysisLogger.removeRun(id);
        return { streamData: stream.value, requestId: id };
    }

    (async () => {
        try {
            // Check if already cancelled
            if (abortSignal.aborted) {
                log.warn("analyzePricingPageAction", "Request was already aborted before starting");
                stream.done({ step: "CANCELLED", requestId: id });
                await log.close();
                AnalysisLogger.removeRun(id);
                return;
            }

            log.info("analyzePricingPageAction", "Instantiating dependencies...");

            const browserServiceStart = Date.now();
            const browserService = RemotePlaywrightAdapter.createFromEnv();
            log.info("analyzePricingPageAction", `BrowserService instantiated in ${Date.now() - browserServiceStart}ms`);

            const llmServiceStart = Date.now();
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            log.info("analyzePricingPageAction", `LlmService instantiated in ${Date.now() - llmServiceStart}ms`, {
                textModel: llmService.textModel,
                visionModel: llmService.visionModel,
                extractionModel: llmService.extractionModel,
            });

            const useCase = new ParsePricingPageUseCase(
                browserService,
                llmService,
            );

            log.info("analyzePricingPageAction", "Calling useCase.execute()...");
            const useCaseStart = Date.now();

            // Call use case with progress callback and abort signal
            const analyses = await useCase.execute(
                url,
                personas,
                (progress) => {
                    if (!abortSignal.aborted) {
                        // Store progress in the server-side side-channel FIRST so it
                        // survives even if the RSC stream blocks (e.g., client navigated
                        // away and stopped consuming the stream). stream.update() may
                        // block indefinitely when there's no consumer.
                        if (progress.screenshot) {
                            storeScreenshot(id, progress.screenshot);
                        }
                        if (progress.step || progress.completedCount !== undefined) {
                            storeProgress(id, {
                                step: progress.step,
                                completedAnalyses: progress.completedCount,
                                totalAnalyses: personas.length,
                            });
                        }
                        // Then attempt the RSC stream update. This may block or fail
                        // silently if the client disconnected — the side-channel data
                        // is already persisted above.
                        try { stream.update({ ...progress, requestId: id }); } catch {}
                        log.trace("analyzePricingPageAction", "Progress update", {
                            step: progress.step,
                            personaName: progress.personaName || null,
                            completedCount: progress.completedCount,
                            totalCount: progress.totalCount,
                            hasAnalysisToken: !!progress.analysisToken,
                            analysisTokenLength: progress.analysisToken?.length || 0,
                        });
                    }
                },
                abortSignal,
                { imageBase64, tokenLimit: PERSONA_TOKEN_LIMIT, runId: id }
            );

            const useCaseDuration = Date.now() - useCaseStart;
            log.info("analyzePricingPageAction", `useCase.execute() completed in ${useCaseDuration}ms`, {
                totalDurationMs: useCaseDuration,
                analysisCount: analyses.length,
            });

            // Log summary of each analysis
            analyses.forEach((a, i) => {
                log.info("analyzePricingPageAction", `Analysis[${i}] summary`, {
                    id: a.id,
                    hasGutReaction: !!a.gutReaction,
                    gutReactionPreview: a.gutReaction?.slice(0, 100),
                    thoughtsLength: a.thoughts?.length || 0,
                    scores: a.scores ? {
                        clarity: a.scores.clarity,
                        valuePerception: a.scores.valuePerception,
                        trust: a.scores.trust,
                        explorationIntent: a.scores.explorationIntent,
                        analysisIntent: a.scores.analysisIntent,
                        buyIntent: a.scores.buyIntent,
                    } : null,
                    riskCount: a.risks?.length || 0,
                    recommendationCount: a.recommendations?.length || 0,
                    hasAiSuggestion: !!a.aiSuggestion,
                    rawAnalysisLength: a.rawAnalysis?.length || 0,
                });
            });

            if (!abortSignal.aborted) {
                log.info("analyzePricingPageAction", `Sending DONE with ${analyses.length} analyses`);
                // Persist results to server-side store so they survive page reloads
                simulationResultStore.save(id, analyses);
                // Mark completed in the progress store so the polling-based
                // reconnection on the simulation detail page can detect it
                // even when the RSC stream is disconnected.
                storeCompleted(id);
                stream.done({ step: "DONE", analyses, requestId: id });
                log.info("analyzePricingPageAction", "stream.done(DONE) completed");
            } else {
                log.warn("analyzePricingPageAction", "Request aborted during execution, sending CANCELLED");
                simulationResultStore.saveError(id, 'Request was cancelled');
                stream.done({ step: "CANCELLED", requestId: id });
            }
        } catch (error) {
            if (abortSignal.aborted) {
                log.warn("analyzePricingPageAction", "Request was cancelled (caught in catch block)");
                simulationResultStore.saveError(id, 'Request was cancelled');
                try { stream.done({ step: "CANCELLED", requestId: id }); } catch {}
            } else {
                const errMsg = (error as Error).message;
                const errStack = (error as Error).stack;
                log.error("analyzePricingPageAction", "Error analyzing pricing page", {
                    error: errMsg,
                    stack: errStack?.split('\n').slice(0, 6).join('\n'),
                    url,
                    personaCount: personas.length,
                });
                simulationResultStore.saveError(id, errMsg);
                storeProgress(id, { error: errMsg });
                try { stream.done({ step: "ERROR", error: errMsg, requestId: id }); } catch {}
            }
        } finally {
            const totalDuration = Date.now() - actionStartTime;
            log.info("analyzePricingPageAction", `=== ACTION END (${totalDuration}ms total) ===`);
            cancellationManager.clearRequest(id);
            await log.close();
            AnalysisLogger.removeRun(id);
        }
    })();

    return { streamData: stream.value, requestId: id };
}

async function runRemote(
    url: string,
    personas: Persona[],
    requestId?: string,
    imageBase64?: string,
) {
    const id = requestId || `pricing-${Date.now()}`;
    const res = await fetch(`${VPS_BACKEND_URL}/api/vps/analyze-pricing`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${VPS_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
            url,
            personas,
            runId: id,
            ...(imageBase64 ? { imageBase64 } : {}),
        }),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`VPS analysis failed (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    return { runId: data.runId };
}
