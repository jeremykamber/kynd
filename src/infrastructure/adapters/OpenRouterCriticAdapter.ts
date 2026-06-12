import OpenAI from "openai";
import { ICriticServicePort } from "@/domain/ports/ICriticServicePort";
import { Persona, stringifyPersona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { CriticEvaluation } from "@/domain/entities/CriticEvaluation";
import { stripCodeFence } from "./llmUtils";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export class OpenRouterCriticAdapter implements ICriticServicePort {
  private client: OpenAI;
  private model: string;

  constructor(client: OpenAI, model: string) {
    this.client = client;
    this.model = model;
  }

  static createFromEnv(): OpenRouterCriticAdapter {
    const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    const model = process.env.OPENROUTER_CRITIC_MODEL || process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    const client = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    return new OpenRouterCriticAdapter(client, model);
  }

  async evaluateConsistency(
    persona: Persona,
    analysis: PricingAnalysis,
    runId?: string,
  ): Promise<CriticEvaluation> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    const startTime = Date.now();

    log?.info("OpenRouterCriticAdapter", `evaluateConsistency START for "${persona.name}"`, {
      analysisId: analysis.id,
      model: this.model,
      personaId: persona.id,
    });

    const personaDetails = stringifyPersona(persona);
    const personaBackstory = persona.backstory || "No backstory provided.";

    const prompt = `
You are a Senior UX Director and Behavioral Psychologist. Your task is to critique an AI-generated pricing analysis to ensure "Deep Binding" between the persona's history and their purported thoughts.

### INSTRUCTIONS:
1. Review the PERSONA PROFILE and their DEEP BACKSTORY.
2. Review the PRICING ANALYSIS (Thoughts, Scores, Risks) generated for this persona.
3. Perform a "Deep Binding check":
   - Does the analysis reference or align with specific trauma, wins, or financial habits mentioned in the backstory?
   - Is the "voice" of the thoughts consistent with the persona's education and personality?
   - Are the scores logically derived from the persona's specific risk tolerance and goals?
   - Identify any "hallucinations" (where the AI analysis claims the persona would feel X, but the backstory suggests they would feel Y).

### PERSONA PROFILE:
${personaDetails}

### DEEP BACKSTORY:
${personaBackstory}

### PRICING ANALYSIS TO EVALUATE:
URL: ${analysis.url}
Thoughts: ${analysis.thoughts}
Scores: ${JSON.stringify(analysis.scores)}
Risks: ${analysis.risks.join(", ")}

### OUTPUT FORMAT:
Return ONLY a JSON object matching this structure:
{
  "coherenceScore": number, // 1-10 (10 is perfect alignment)
  "isHallucinating": boolean, // true if the analysis contradicts the backstory
  "critique": "string", // Detailed explanation of the alignment or lack thereof
  "suggestedFix": "string" // Optional: How to improve the analysis to better match the persona
}

Critique with high standards. If the analysis is generic and doesn't leverage the specific depth of the backstory, lower the coherence score.
`;

    log?.info("OpenRouterCriticAdapter", `Sending critique request for "${persona.name}"...`, {
      promptLength: prompt.length,
      backstoryLength: personaBackstory.length,
      thoughtsLength: analysis.thoughts?.length || 0,
    });

    const apiStart = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: "You are a Senior UX Director specializing in behavioral consistency and persona validation." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const apiDuration = Date.now() - apiStart;
    log?.info("OpenRouterCriticAdapter", `API response received for "${persona.name}"`, {
      durationMs: apiDuration,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      log?.error("OpenRouterCriticAdapter", `No response from Critic LLM for "${persona.name}"`);
      throw new Error("No response from Critic LLM");
    }

    try {
      const parsed = JSON.parse(stripCodeFence(content));
      const totalDuration = Date.now() - startTime;

      const result: CriticEvaluation = {
        id: `critique-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        analysisId: analysis.id,
        personaId: persona.id,
        coherenceScore: typeof parsed.coherenceScore === 'number' ? parsed.coherenceScore : 5,
        isHallucinating: !!parsed.isHallucinating,
        critique: parsed.critique || "No critique provided.",
        suggestedFix: parsed.suggestedFix,
      };

      log?.info("OpenRouterCriticAdapter", `Evaluation complete for "${persona.name}"`, {
        coherenceScore: result.coherenceScore,
        isHallucinating: result.isHallucinating,
        totalDurationMs: totalDuration,
        critiquePreview: result.critique.slice(0, 200),
      });

      return result;
    } catch (error) {
      log?.error("OpenRouterCriticAdapter", `Failed to parse critique for "${persona.name}"`, {
        error: error instanceof Error ? error.message : String(error),
        rawResponse: content.slice(0, 500),
      });
      throw new Error(`Failed to parse Critic evaluation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
