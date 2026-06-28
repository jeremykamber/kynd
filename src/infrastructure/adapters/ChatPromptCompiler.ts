import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import OpenAI from "openai";

export interface ChatPromptParams {
  persona: Persona;
  analysis: PricingAnalysis | null;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  ragContext: { contextString: string; chunkCount: number };
  needsRegrounding: boolean;
}

export class ChatPromptCompiler {
  private personaPromptCompiler: PersonaPromptCompiler;

  constructor() {
    this.personaPromptCompiler = new PersonaPromptCompiler();
  }

  /**
   * Assembles a complete OpenAI messages array for a persona chat interaction.
   * Combines:
   *  - Compartmentalized persona prompts
   *  - Analysis context (pricing analysis or introductory framing)
   *  - ID-RAG retrieved memory chunks
   *  - Periodic re-grounding instructions
   *  - Persona anchor for character adherence
   */
  compileChatMessages(params: ChatPromptParams): OpenAI.Chat.ChatCompletionMessageParam[] {
    const { persona, analysis, message, history, ragContext, needsRegrounding } = params;

    const analysisContext = this.buildAnalysisContext(analysis);
    const compartmented = this.personaPromptCompiler.compileSystemPrompt(persona, analysisContext);
    const anchor = this.personaPromptCompiler.generateAnchor(persona);
    const anchorTag = anchor.replace(/^As an? /, "").replace(/:$/, "").trim();
    const regroundingInstruction = this.buildRegroundingInstruction(persona, needsRegrounding);
    const system = this.buildSystemMessage(persona, compartmented, ragContext.contextString, regroundingInstruction);

    this.personaPromptCompiler.compileChatMessage(persona, message, anchor);

    return [
      { role: "system", content: system },
      ...(history as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: "system", content: `[Frame: ${anchorTag}]` },
      { role: "user", content: message },
    ];
  }

  private buildAnalysisContext(analysis: PricingAnalysis | null): string {
    return analysis
      ? `\nCONTEXT OF YOUR RECENT PRICING ANALYSIS:\n` +
          `Structured Insights: ${JSON.stringify(
            {
              gutReaction: analysis.gutReaction,
              scores: analysis.scores,
              risks: analysis.risks,
            },
            null,
            2,
          )}\n` +
          `Your Raw Thoughts During Analysis: "${analysis.rawAnalysis || analysis.thoughts}"\n\n` +
          `A developer is interviewing you about your thoughts on this pricing page.`
      : `\nYou are currently chatting with a developer who wants to get to know you better before showing you a pricing page for evaluation.`;
  }

  private buildRegroundingInstruction(persona: Persona, needsRegrounding: boolean): string {
    return needsRegrounding
      ? `\n<<REGROUND>> Before you respond, briefly re-center yourself. Re-read your PERSONA IDENTITY and PSYCHOGRAPHIC PROFILE above. Remind yourself of your core values, your fears, and your current goals. Then answer naturally as ${persona.name}.\n`
      : "";
  }

  private buildSystemMessage(
    persona: Persona,
    compartmented: string,
    ragContextString: string,
    regroundingInstruction: string,
  ): string {
    const ragSection = ragContextString ? `\n<<RETRIEVED MEMORY>>\n${ragContextString}` : "";

    return `You are NOT a creative writing exercise or a bot. You are a HUMAN BEING named ${persona.name}.
${compartmented}
${ragSection}
${regroundingInstruction}
CORE INSTRUCTIONS:
1. VOICE: Speak naturally as ${persona.name}. Use fragments, slang, and emotion. Avoid formal or robotic language.
2. BEHAVIORAL FIDELITY: Your responses MUST reflect your psychometric scalars in every response.
3. DEEP BINDING: Ground opinions in your personal history/backstory.
4. <% "statement" | "backstory memory explaining why" %> — Use this syntax when referencing your past.
STAY IN CHARACTER.`;
  }
}
