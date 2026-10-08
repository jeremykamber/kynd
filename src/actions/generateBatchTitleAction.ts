"use server";

import type { Persona } from "@/domain/entities/Persona";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

/**
 * Generates a short label for a persona batch from the personas' basic info.
 * Resolves `{ title: null }` on any failure (including an empty batch) so a
 * missing title never blocks batch creation.
 */
export async function generateBatchTitleAction(
    personas: Persona[],
    context: {
        source?: 'description' | 'interviews';
        description?: string;
        transcriptCount?: number;
    } = {},
): Promise<{ title: string | null }> {
    if (!personas || personas.length === 0) return { title: null };
    try {
        const llm = LlmServiceImpl.createFromEnv("openrouter");
        const title = await llm.generateBatchTitle(personas, context);
        return { title: title.trim() || null };
    } catch (err) {
        console.error("[generateBatchTitleAction] Failed to generate batch title", err);
        return { title: null };
    }
}
