import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import OpenAI from "openai";

export class ChatAdapter {
  private promptCompiler: PersonaPromptCompiler;

  constructor(private llmService: LlmServiceImpl) {
    this.promptCompiler = new PersonaPromptCompiler();
  }

  /**
   * Chat with a persona about their analysis (streaming version).
   * Uses compartmentalized persona prompts (Wang et al., 2024b) with
   * persona anchors (SyTTA / Atri et al., 2026) injected every turn.
   */
  async * chatWithPersonaStream(
    persona: Persona,
    analysis: PricingAnalysis | null,
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ): AsyncIterable<string> {
    const analysisContext = analysis
      ? `\nCONTEXT OF YOUR RECENT PRICING ANALYSIS:\n` +
      `Structured Insights: ${JSON.stringify({ gutReaction: analysis.gutReaction, scores: analysis.scores, risks: analysis.risks }, null, 2)}\n` +
      `Your Raw Thoughts During Analysis: "${analysis.rawAnalysis || analysis.thoughts}"\n\n` +
      `A developer is interviewing you about your thoughts on this pricing page.`
      : `\nYou are currently chatting with a developer who wants to get to know you better before showing you a pricing page for evaluation.`;

    const compartmented = this.promptCompiler.compileSystemPrompt(persona, analysisContext);

    const anchor = this.promptCompiler.generateAnchor(persona);

    const system = `You are NOT a creative writing exercise or a bot. You are a HUMAN BEING named ${persona.name}.
${compartmented}

CORE INSTRUCTIONS:
1. VOICE: Speak naturally as ${persona.name}. Use fragments, slang, and emotion. Avoid formal or robotic language.
2. BEHAVIORAL FIDELITY: Your responses MUST reflect your psychometric scalars in every response.
3. DEEP BINDING: Ground opinions in your personal history/backstory.
4. <% "statement" | "backstory memory explaining why" %> — Use this syntax when referencing your past.
STAY IN CHARACTER.`;

    const anchorMessage = this.promptCompiler.compileChatMessage(persona, message, anchor);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...(history as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: "user", content: anchorMessage },
    ];

    for await (const chunk of this.llmService.createChatCompletionStream(messages, {
      temperature: 0.7,
      purpose: "Streaming Chat"
    })) {
      yield chunk;
    }
  }

  /**
   * Validates if a user's prompt is within the persona's expected domain.
   */
  async validatePromptDomain(
    persona: Persona,
    prompt: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    const system = `Determine if the user's message to persona ${persona.name} is IN DOMAIN or OUT OF DOMAIN.
        IN DOMAIN: Software product, professional background, SaaS pricing, natural human tester conversation.
        OUT OF DOMAIN: AI assistant tasks (code, poems, complex math, general search).
        
        Respond ONLY with a JSON object: { "isValid": boolean, "reason": "string" }`;

    try {
      const response = await this.llmService.createChatCompletion(
        [{ role: "system", content: system }, { role: "user", content: `MESSAGE: "${prompt}"` }],
        {
          model: this.llmService.smallTextModel,
          response_format: { type: "json_object" },
          temperature: 0,
          purpose: "Guardrail Check"
        }
      );

      const result = JSON.parse(response || "{}");
      return {
        isValid: result.isValid === true,
        reason: result.reason || "This request is outside the scope of this persona interview."
      };
    } catch (err) {
      console.error("[ChatAdapter] Guardrail check failed:", err);
      return { isValid: true };
    }
  }
}
