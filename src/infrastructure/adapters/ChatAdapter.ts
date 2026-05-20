import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import { IdRagStore } from "./IdRagStore";
import { IdRagService } from "./IdRagService";
import OpenAI from "openai";

export class ChatAdapter {
  private promptCompiler: PersonaPromptCompiler;
  private ragStore: IdRagStore;
  private ragService: IdRagService;
  private ingestedPersonas: Set<string> = new Set();

  constructor(private llmService: LlmServiceImpl) {
    this.promptCompiler = new PersonaPromptCompiler();
    this.ragStore = new IdRagStore();
    this.ragService = new IdRagService(this.ragStore);
  }

  /**
   * Chat with a persona about their analysis (streaming version).
   * Uses compartmentalized persona prompts (Wang et al., 2024b) with
   * persona anchors (SyTTA / Atri et al., 2026) and ID-RAG
   * (Tan et al., 2025) injected every turn.
   */
  async * chatWithPersonaStream(
    persona: Persona,
    analysis: PricingAnalysis | null,
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ): AsyncIterable<string> {
    // Ingest backstory into ID-RAG store on first interaction with this persona
    if (!this.ingestedPersonas.has(persona.id) && persona.backstory) {
      this.ragStore.ingestPersona(persona);
      this.ingestedPersonas.add(persona.id);
      console.log("[ChatAdapter] Ingested", persona.name, "backstory into ID-RAG store");
    }

    // Retrieve relevant memory chunks for this message
    const ragContext = this.ragService.retrieveContext(persona, message, 3);
    if (ragContext.chunkCount > 0) {
      console.log(`[ChatAdapter] Retrieved ${ragContext.chunkCount} relevant memory chunks for "${persona.name}"`);
    }

    const analysisContext = analysis
      ? `\nCONTEXT OF YOUR RECENT PRICING ANALYSIS:\n` +
      `Structured Insights: ${JSON.stringify({ gutReaction: analysis.gutReaction, scores: analysis.scores, risks: analysis.risks }, null, 2)}\n` +
      `Your Raw Thoughts During Analysis: "${analysis.rawAnalysis || analysis.thoughts}"\n\n` +
      `A developer is interviewing you about your thoughts on this pricing page.`
      : `\nYou are currently chatting with a developer who wants to get to know you better before showing you a pricing page for evaluation.`;

    const compartmented = this.promptCompiler.compileSystemPrompt(persona, analysisContext);

    const anchor = this.promptCompiler.generateAnchor(persona);
    console.log("[ChatAdapter] Persona anchor injected:", anchor);
    console.log("[ChatAdapter] Using compartmentalized prompt for:", persona.name);

    const system = `You are NOT a creative writing exercise or a bot. You are a HUMAN BEING named ${persona.name}.
${compartmented}

${ragContext.contextString ? `<<RETRIEVED MEMORY>>\n${ragContext.contextString}` : ""}

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
