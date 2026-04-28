"use server";

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const personasRateLimiter = new RateLimiterMemory({
  keyPrefix: 'personas',
  points: AUDIT_RATE_LIMIT_MAX,
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

export async function generatePersonasAction(personaDescription: string, abortSignal?: AbortSignal) {
    console.log("generatePersonasAction called...");
    const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    } catch { }

    try {
        await personasRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
        return { streamData: stream.value };
    }

    if (abortSignal?.aborted) {
        stream.done({ step: "ERROR", error: "Request cancelled" });
        return { streamData: stream.value };
    }

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const useCase = new GeneratePersonasUseCase(llmService);

            if (abortSignal?.aborted) {
                stream.done({ step: "ERROR", error: "Request cancelled" });
                return;
            }

            const personas = await useCase.execute(personaDescription, (progress) => {
                if (abortSignal?.aborted) return;
                stream.update(progress);
            });

            if (abortSignal?.aborted) return;

            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
        } catch (error) {
            if (abortSignal?.aborted) return;
            console.error("Error generating personas:", error);
            stream.done({ step: "ERROR", error: (error as Error).message });
        }
    })();

    return { streamData: stream.value };
}
