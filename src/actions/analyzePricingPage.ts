"use server";
import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { ParsePricingPageUseCase } from "@/application/usecases/ParsePricingPageUseCase";
import { RemotePlaywrightAdapter } from "@/infrastructure/adapters/RemotePlaywrightAdapter";
import { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { cancellationManager } from "@/infrastructure/RequestCancellationManager";

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const auditRateLimiter = new RateLimiterMemory({
    keyPrefix: 'audit',
    points: AUDIT_RATE_LIMIT_MAX, // Number of requests
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000), // Duration in seconds
});

const PERSONA_TOKEN_LIMIT = parseInt(process.env.PERSONA_TOKEN_LIMIT || '2000');

export async function analyzePricingPageAction(
    url: string,
    personas: Persona[],
    requestId?: string,
    imageBase64?: string,
) {
    const id = requestId || `pricing-${Date.now()}`;
    const abortController = cancellationManager.createRequest(id);
    const abortSignal = abortController.signal;
    const stream = createStreamableValue<any>({ step: "STARTING", requestId: id });

    // Get client IP for rate limiting
    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    } catch {
        // In case headers fail, use unknown
    }

    // Check rate limit
    try {
        await auditRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`, requestId: id });
        return { streamData: stream.value, requestId: id };
    }

    (async () => {
        try {
            // Check if already cancelled
            if (abortSignal.aborted) {
                stream.done({ step: "CANCELLED", requestId: id });
                return;
            }

            // Instantiate dependencies
            const browserService = RemotePlaywrightAdapter.createFromEnv();
            const llmService = LlmServiceImpl.createFromEnv("openrouter"); // Defaulting to OpenRouter, can be configured via env
            const useCase = new ParsePricingPageUseCase(
                browserService,
                llmService,
            );

            // Call use case with progress callback and abort signal
            const analyses = await useCase.execute(
                url,
                personas,
                (progress) => {
                    // Check if cancelled before sending update
                    if (!abortSignal.aborted) {
                        stream.update({ ...progress, requestId: id });
                    }
                },
                abortSignal,
                { imageBase64, tokenLimit: PERSONA_TOKEN_LIMIT }
            );

            if (!abortSignal.aborted) {
                stream.done({ step: "DONE", analyses, requestId: id });
            } else {
                stream.done({ step: "CANCELLED", requestId: id });
            }
        } catch (error) {
            if (abortSignal.aborted) {
                console.log("Request was cancelled");
                stream.done({ step: "CANCELLED", requestId: id });
            } else {
                console.error("Error analyzing pricing page:", error);
                stream.done({ step: "ERROR", error: (error as Error).message, requestId: id });
            }
        } finally {
            cancellationManager.clearRequest(id);
        }
    })();

    return { streamData: stream.value, requestId: id };
}
