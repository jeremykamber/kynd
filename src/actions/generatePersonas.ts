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

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;

async function runLocally(personaDescription: string) {
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

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const useCase = new GeneratePersonasUseCase(llmService);

            const personas = await useCase.execute(personaDescription, (progress) => {
                try { stream.update(progress); } catch {}
            });

            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
        } catch (error) {
            console.error("Error generating personas:", error);
            try { stream.done({ step: "ERROR", error: (error as Error).message }); } catch {}
        }
    })();

    return { streamData: stream.value };
}

async function runRemote(personaDescription: string) {
    const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

    (async () => {
        try {
            const res = await fetch(`${VPS_BACKEND_URL}/api/vps/generate-personas`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${VPS_AUTH_TOKEN}`,
                },
                body: JSON.stringify({ personaDescription }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                stream.done({ step: "ERROR", error: err.error || `HTTP ${res.status}` });
                return;
            }

            const data = await res.json();
            stream.done({ step: "DONE", personas: data.personas || data });
        } catch (error) {
            console.error("Error in remote generatePersonas:", error);
            try { stream.done({ step: "ERROR", error: (error as Error).message }); } catch {}
        }
    })();

    return { streamData: stream.value };
}

export async function generatePersonasAction(personaDescription: string) {
    if (process.env.NODE_ENV === "development" || process.env.IS_VPS === "true") return runLocally(personaDescription);
    return runRemote(personaDescription);
}
