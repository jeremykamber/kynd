"use server";

import { GeneratePersonasFromInterviewsUseCase } from "@/application/usecases/GeneratePersonasFromInterviewsUseCase";
import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { IdRagStore } from "@/infrastructure/adapters/IdRagStore";

import { createStreamableValue } from "@ai-sdk/rsc";
import { headers } from 'next/headers';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const AUDIT_RATE_LIMIT_MAX = parseInt(process.env.AUDIT_RATE_LIMIT_MAX || '5');
const AUDIT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUDIT_RATE_LIMIT_WINDOW_MS || '60000');

const pipelineRateLimiter = new RateLimiterMemory({
    keyPrefix: 'pipeline',
    points: AUDIT_RATE_LIMIT_MAX,
    duration: Math.floor(AUDIT_RATE_LIMIT_WINDOW_MS / 1000),
});

const VPS_BACKEND_URL = process.env.VPS_BACKEND_URL;
const VPS_AUTH_TOKEN = process.env.VPS_AUTH_TOKEN;

async function runLocally(formData: FormData) {
    console.log("generatePersonasFromInterviewsAction called...");
    const stream = createStreamableValue<any>({ step: "UPLOADING" });

    let clientIP = 'unknown';
    try {
        const headersList = await headers();
        clientIP = headersList.get('x-forwarded-for')?.split(',')[0] || headersList.get('x-real-ip') || 'unknown';
    } catch { }

    try {
        await pipelineRateLimiter.consume(clientIP);
    } catch (rejRes: any) {
        const msBeforeNext = rejRes.msBeforeNext;
        const retryAfter = Math.round(msBeforeNext / 1000);
        stream.done({ step: "ERROR", error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
        return { streamData: stream.value };
    }

    const files: { filename: string; content: string }[] = [];
    for (const [key, value] of formData.entries()) {
        if (value instanceof File && (key === "files" || key.startsWith("file_"))) {
            const content = await value.text();
            files.push({ filename: value.name, content });
        }
    }

    if (files.length === 0) {
        stream.done({ step: "ERROR", error: "No transcript files provided. Please upload at least one interview transcript." });
        return { streamData: stream.value };
    }

    (async () => {
        try {
            const llmService = LlmServiceImpl.createFromEnv("openrouter");
            const idRagStore = new IdRagStore();
            const generatePersonasUseCase = new GeneratePersonasUseCase(llmService);
            const useCase = new GeneratePersonasFromInterviewsUseCase(
                llmService,
                idRagStore,
                generatePersonasUseCase,
            );

            const personas = await useCase.execute(files, (progress) => {
                stream.update(progress);
            });

            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
        } catch (error) {
            console.error("Error generating personas from interviews:", error);
            stream.done({ step: "ERROR", error: (error as Error).message });
        }
    })();

    return { streamData: stream.value };
}

async function runRemote(formData: FormData) {
    const stream = createStreamableValue<any>({ step: "UPLOADING" });

    (async () => {
        try {
            const res = await fetch(`${VPS_BACKEND_URL}/api/vps/generate-personas-from-interviews`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${VPS_AUTH_TOKEN}`,
                    // No Content-Type — let fetch set multipart boundary automatically
                },
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                stream.done({ step: "ERROR", error: err.error || `HTTP ${res.status}` });
                return;
            }

            const data = await res.json();
            stream.done({ step: "DONE", personas: data.personas || data });
        } catch (error) {
            console.error("Error in remote generatePersonasFromInterviews:", error);
            stream.done({ step: "ERROR", error: (error as Error).message });
        }
    })();

    return { streamData: stream.value };
}

export async function generatePersonasFromInterviewsAction(formData: FormData) {
    if (process.env.NODE_ENV === "development" || process.env.IS_VPS === "true") return runLocally(formData);
    return runRemote(formData);
}
