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
  points: AUDIT_RATE_LIMIT_MAX, // Number of requests
  duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000), // Duration in seconds
});

export async function generatePersonasAction(personaDescription: string) {
    console.log("generatePersonasAction called...");
    const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

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
        await personasRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
        return { streamData: stream.value };
    }

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const useCase = new GeneratePersonasUseCase(llmService);
            const personas = await useCase.execute(personaDescription, (progress) => {
                stream.update(progress);
            });
            // Final snapshot of personas for the DONE state
            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
        } catch (error) {
            console.error("Error generating personas:", error);
            stream.done({ step: "ERROR", error: (error as Error).message });
        }
    })();

    return { streamData: stream.value };
}
