"use server"

import { ChatWithPersonaUseCase } from "@/application/usecases/ChatWithPersonaUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

import { createStreamableValue } from "@ai-sdk/rsc";

export async function chatWithPersonaAction(
  persona: Persona,
  analysis: PricingAnalysis | null,
  message: string,
  history: { role: 'user' | 'assistant', content: string }[]
) {
  const stream = createStreamableValue<any>("");

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new ChatWithPersonaUseCase(llmService);

      // Guardrail check
      // const validation = await llmService.validatePromptDomain(persona, message);
      // if (!validation.isValid) {
      //   stream.done(`GUARDRAIL_VIOLATION: ${validation.reason}`);
      //   return;
      // }

      const responseStream = useCase.executeStream(persona, analysis, message, history);

      let fullText = "";
      for await (const chunk of responseStream) {
        fullText += chunk;
        stream.update(fullText);
      }

      stream.done(fullText);
    } catch (error) {
      console.error("Error in chatWithPersonaAction:", error);
      stream.done({ step: "ERROR", error: (error as Error).message });
    }
  })();

  return { streamData: stream.value };
}
