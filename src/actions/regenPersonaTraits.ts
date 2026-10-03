"use server"

import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl"

/**
 * Infers Big Five trait values from an edited persona backstory. Runs the LLM
 * locally only; resolves with the suggested traits.
 */
export async function regenPersonaTraitsAction(backstory: string) {
  const llm = LlmServiceImpl.createFromEnv("openrouter")
  const traits = await llm.inferTraitsFromBackstory(backstory)
  return traits
}
