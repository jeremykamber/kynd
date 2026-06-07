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

export async function generatePersonasFromInterviewsAction(formData: FormData) {
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
        // Tracks when the last real progress update was sent.
        // The heartbeat uses this to detect silent periods during LLM batches
        // and send keep-alive pings to prevent the serverless function timeout.
        let lastProgressTime = Date.now();
        let currentStep = 'EXTRACTING';

        const heartbeat = setInterval(() => {
            const idleMs = Date.now() - lastProgressTime;
            // Only send heartbeat if no real progress for 3+ seconds.
            // Real progress always includes a step — heartbeat includes `heartbeat: true`
            // so it's distinguishable if needed.
            if (idleMs >= 3000) {
                stream.update({ step: currentStep, heartbeat: true });
            }
        }, 4000);

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
                lastProgressTime = Date.now();
                if (progress.step) currentStep = progress.step;
                stream.update(progress);
            });

            clearInterval(heartbeat);
            const finalPersonas = JSON.parse(JSON.stringify(personas));
            stream.done({ step: "DONE", personas: finalPersonas });
        } catch (error) {
            clearInterval(heartbeat);
            console.error("Error generating personas from interviews:", error);
            stream.done({ step: "ERROR", error: (error as Error).message });
        }
    })();

    return { streamData: stream.value };
}
