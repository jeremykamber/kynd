import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysisSchema } from "@/domain/entities/PricingAnalysis";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { PersonaPromptCompiler } from "./PersonaPromptCompiler";
import { IdRagStore } from "./IdRagStore";
import { IdRagService } from "./IdRagService";
import { streamObject } from "ai";
import { PricingLocation } from "@/domain/ports/LlmServicePort";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export class VisionAnalysisAdapter {
  private promptCompiler: PersonaPromptCompiler;
  private ragStore: IdRagStore;
  private ragService: IdRagService;
  private ingestedPersonas: Set<string> = new Set();

  constructor(private llmService: LlmServiceImpl) {
    this.promptCompiler = new PersonaPromptCompiler();
    this.ragStore = new IdRagStore();
    this.ragService = new IdRagService(this.ragStore);
  }

  private ensureIngested(persona: Persona, runId?: string): void {
    if (!this.ingestedPersonas.has(persona.id) && persona.backstory) {
      this.ragStore.ingestPersona(persona);
      this.ingestedPersonas.add(persona.id);
      const log = runId ? AnalysisLogger.forRun(runId) : null;
      log?.info("VisionAnalysisAdapter", `Ingested ${persona.name} backstory into ID-RAG store`, {
        personaId: persona.id,
        backstoryLength: persona.backstory.length,
      });
    }
  }

  async analyzePricingPageStream(
    persona: Persona,
    screenshotBase64: string,
    pageHtml?: string,
    options: { tokenLimit?: number; runId?: string } = {}
  ) {
    const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
    const tokenLimit = options.tokenLimit ?? 2000;
    const methodStart = Date.now();

    log?.info("VisionAnalysisAdapter", `analyzePricingPageStream START for "${persona.name}"`, {
      tokenLimit,
      hasHtml: !!pageHtml,
      htmlLength: pageHtml?.length || 0,
      screenshotLength: screenshotBase64.length,
    });

    this.ensureIngested(persona, options.runId);

    // Retrieve relevant memories based on the page context
    const ragStart = Date.now();
    const query = pageHtml ? `Pricing page about ${pageHtml.slice(0, 200)}` : "Evaluating a pricing page";
    const ragContext = this.ragService.retrieveContext(persona, query, 3);
    const ragDuration = Date.now() - ragStart;
    log?.info("VisionAnalysisAdapter", `ID-RAG retrieval for "${persona.name}"`, {
      query: query.slice(0, 100),
      chunkCount: ragContext.chunkCount,
      contextStringLength: ragContext.contextString.length,
      durationMs: ragDuration,
    });

    const compileStart = Date.now();
    const compartments = this.promptCompiler.compileSystemPrompt(persona);
    const personaAnchor = this.promptCompiler.generateAnchor(persona);
    const compileDuration = Date.now() - compileStart;
    log?.info("VisionAnalysisAdapter", `Prompt compilation for "${persona.name}"`, {
      compartmentsLength: compartments.length,
      anchor: personaAnchor,
      durationMs: compileDuration,
    });
    log?.debug("VisionAnalysisAdapter", `Compartmentalized prompt for "${persona.name}"`, {
      prompt: compartments.slice(0, 1000) + `...(truncated, total ${compartments.length} chars)`,
    });

    const system = `You are a specialized JSON-only agent evaluating a pricing page as a specific persona.
        
        ${compartments}
        
        <<ANALYSIS TASK>>
        You are looking at a pricing page. You have been provided with:
        1. A screenshot of the exact viewport containing the pricing.
        2. A verified factual summary of the page's HTML (including product info, tier data, and fine print).
        
        ${ragContext.contextString ? `<<RETRIEVED MEMORY>>\n${ragContext.contextString}\n` : ""}
        
        <<PERSONALITY BIAS APPLICATION>>
        Your personality profile drives how you evaluate. Apply it aggressively:
        - Your Neuroticism determines how many risks you flag and how severe.
        - Your Conscientiousness determines how much fine print you read.
        - Your Openness determines whether new features excite or concern you.
        - Your Extraversion determines whether you seek team validation.
        - Your Agreeableness determines whether you give benefit of doubt.
        These are WHO YOU ARE. Your scores must reflect your personality.
        
        <<OPENNESS PRIMING>>
        ${personaAnchor} You're open to this. You're approaching this as someone who COULD genuinely use a tool like this. You're not looking for reasons to reject it — you're evaluating honestly, looking for what works and what doesn't. A skeptical but fair assessment.
        
        CALIBRATION — Your evaluation should be consistent with your own pricing sensitivity and typical budget. You have real experience in your domain and know what things should cost. Let YOUR unique profile — not generic expectations — drive your reaction.
        
        STRICT OUTPUT RULES:
        - Respond ONLY with a valid JSON object following the provided schema.
        - You MUST include ALL fields: gutReaction, thoughts, scores (with reasons), risks, and recommendations.
        - NO conversational preamble. NO monologue. NO text before or after the JSON.
        - Use standard JSON double quotes (") for all keys and string values.
        - Escape any literal double quotes within strings using a backslash (\").
        - If you have nothing more to say, STOP.
        - The 'thoughts' field MUST be limited to roughly ${Math.floor(tokenLimit * 0.75)} tokens to avoid truncated JSON.
        - RISKS: Limit to 3 items. Write from your (the persona's) perspective — what concerns you about this page? Ground each risk in something specific.
        - RECOMMENDATIONS: These are NOT your personal reflections. These are directives YOU are writing TO THE COMPANY — suggestions for what they should change on their pricing page. Write imperative sentences like "Add a monthly billing option" or "Remove the annual lock-in." Do NOT write "Check if..." or "Look for..." — you are not advising yourself. You are telling the company what to fix. Do NOT use first person here.
        - AI SUGGESTION: Write ONE persona-specific actionable insight in YOUR (the persona's) voice. This is THE ONE THING this company should change to win YOU over. Reference something specific you saw on the page. Write it as YOUR suggestion, e.g. "As a small business owner, I'd want to see..." or "I'd need to see..." — keep it in first person, grounded in your persona.
         - NO REPETITION: Do NOT repeat information across different fields. Keep 'gutReaction' short and punchy.
         
         STRUCTURED THOUGHTS FORMAT:
         Inside your 'thoughts' field, structure your analysis using these markers:
         [The Good] — What works well. Specific positive observations.
         [The Bad] — What doesn't work. Specific criticisms.
         [The Dealbreaker] — The single biggest reason you would NOT buy.
         
         SCORING: INTENT FUNNEL + RATIONALES
        For each score, you MUST provide both a number (1-10) AND a 1-2 sentence reason explaining WHY.
        
        The three intent scores form a funnel: Exploration → Analysis → Buy.
        - explorationIntent (1-10): Would you explore this further? Click around? Read docs? Compare?
          1=I'd close the tab. 10=I'm already digging into the features page.
        - analysisIntent (1-10): Would you do a deep analysis? Run a trial? Compare with alternatives?
          1=Not worth my time. 10=I'm already planning a pilot with my team.
        - buyIntent (1-10): Would you actually purchase?
          1=Never. 10=Ready to buy now.
        
        The funnel should generally narrow: explorationIntent >= analysisIntent >= buyIntent.
        If you'd explore but not buy, that's normal. A high buyIntent with low exploration is suspicious.
        
        STRUCTURE: Scores → Reasons → Narrative Thoughts
        1. Your scores come first: clarity, valuePerception, trust — each with a reason
        2. Then the intent funnel: explorationIntent, analysisIntent, buyIntent — each with a reason
        3. Then your narrative thoughts, gut reaction, risks, and recommendations
        Your reasons should be specific and grounded in what you see on the page.
        
        HYBRID GROUNDING RULES:
        - Use the screenshot to gauge visual appeal, layout, emotion, and visual hierarchy.
        - Use the HTML summary to verify specific prices, plan names, and fine print that might be cut off or hard to read in the image.
        - If there is a contradiction, trust the HTML summary for hard data (prices/features) and the screenshot for layout/emotion.
        
        SCORING LOGIC:
        - Different personas MUST give DIFFERENT scores based on their unique Big Five, values, fears, and pricing sensitivity.
        - Disagreement between score dimensions is fine: you can love the clarity but distrust the vendor.
        - Consistency is mandatory. If you feel "burned" or "skeptical", your scores must reflect that.
        - Funnel logic: low exploration → low analysis → low buy. High exploration → could go either way.
        - Score-sentiment alignment: If your gut reaction is positive, scores should be 6+. If critical, 4 or below.

        SPEAK IN FIRST PERSON for gutReaction, thoughts, risks, score reasons, and aiSuggestion. Be blunt, honest, and natural. Be your persona. EXCEPTION: recommendations are NOT first person — they are directives to the company (see RECOMMENDATIONS rule above).`;

    const prompt = `Evaluate this pricing page. Return ONLY the JSON object. ${pageHtml ? `\n\nPAGE FACT SUMMARY:\n"""\n${pageHtml}\n"""` : ""}`;

    log?.info("VisionAnalysisAdapter", `Calling streamObject for "${persona.name}"...`, {
      model: this.llmService.visionModel,
      systemPromptLength: system.length,
      promptLength: prompt.length,
      maxTokens: tokenLimit,
    });

    const streamObjectStart = Date.now();
    const streamObjResult = streamObject({
      model: this.llmService.provider(this.llmService.visionModel),
      schema: PricingAnalysisSchema,
      schemaName: "PricingAnalysis",
      schemaDescription: "A detailed evaluation of a pricing page from a persona's perspective.",
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              image: screenshotBase64,
            },
          ],
        },
      ],
      temperature: 0.4,
      maxTokens: tokenLimit,
    } as any);
    const streamObjectDuration = Date.now() - streamObjectStart;
    const totalDuration = Date.now() - methodStart;
    log?.info("VisionAnalysisAdapter", `streamObject() call returned for "${persona.name}"`, {
      streamObjectCallDurationMs: streamObjectDuration,
      totalAdapterDurationMs: totalDuration,
    });

    streamObjResult.object
      .then((fullObject: any) => {
        console.log(
          `[TRACE] [AnalysisComplete] persona=${persona.name}, scores=${JSON.stringify({ clarity: fullObject.scores?.clarity, trust: fullObject.scores?.trust, buyIntent: fullObject.scores?.buyIntent })}, risks=${fullObject.risks?.length ?? 0}`
        );
      })
      .catch(() => {});
    return streamObjResult;
  }

  async isPricingVisible(screenshotBase64: string, runId?: string): Promise<boolean> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    log?.trace("VisionAnalysisAdapter", "isPricingVisible called", {
      screenshotLength: screenshotBase64.length,
    });

    const prompt = `Can you see the pricing (tiers, dollar amounts, or plan names) in roughly the center of this screen?
            Return ONLY the word "TRUE" if it is clearly visible, or "FALSE" if it is not. No other text.`;

    const callStart = Date.now();
    const result = await this.llmService.withRetry(async () => {
      const resp = await LlmServiceImpl.limiter(() =>
        this.llmService.client.chat.completions.create({
          model: this.llmService.scoutVisionModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${screenshotBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
      );

      const content =
        resp?.choices?.[0]?.message?.content?.toUpperCase().trim() || "FALSE";
      return content.includes("TRUE");
    });
    const duration = Date.now() - callStart;

    log?.info("VisionAnalysisAdapter", `isPricingVisible result`, {
      result,
      model: this.llmService.scoutVisionModel,
      durationMs: duration,
    });

    return result;
  }

  async isPricingVisibleInHtml(html: string, runId?: string): Promise<PricingLocation> {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    log?.trace("VisionAnalysisAdapter", "isPricingVisibleInHtml called", {
      htmlLength: html.length,
    });

    const prompt = `Analyze if the following text contains pricing information (plans, prices, etc.).
        
        TEXT:
        """\n${html}\n"""
        
        Return a JSON object with the following structure:
        {
          "found": boolean,
          "selector": string | null,
          "anchorText": string | null,
          "reasoning": string
        }
        
        Return ONLY valid JSON.`;

    const callStart = Date.now();
    const content = await this.llmService.createChatCompletion(
      [{ role: "user", content: prompt }],
      {
        temperature: 0,
        model: this.llmService.smallTextModel,
        response_format: { type: "json_object" },
        purpose: "Scouting HTML",
      },
    );

    try {
      const result = JSON.parse(content);
      const duration = Date.now() - callStart;
      log?.info("VisionAnalysisAdapter", `isPricingVisibleInHtml result`, {
        found: result.found,
        selector: result.selector || null,
        anchorText: result.anchorText || null,
        reasoning: result.reasoning,
        durationMs: duration,
      });
      return {
        found: !!result.found,
        selector: result.selector || undefined,
        anchorText: result.anchorText || undefined,
        reasoning: result.reasoning
      };
    } catch (e) {
      log?.warn("VisionAnalysisAdapter", "isPricingVisibleInHtml failed to parse LLM response", {
        error: String(e),
        contentPreview: content.slice(0, 200),
      });
      return { found: false, reasoning: "Failed to parse LLM response" };
    }
  }

  async analyzePricingPageCompletion(
    persona: Persona,
    screenshotBase64: string,
    pageHtml?: string,
    options: { tokenLimit?: number; runId?: string } = {}
  ) {
    const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
    const tokenLimit = options.tokenLimit ?? 2000;
    const methodStart = Date.now();

    log?.info("VisionAnalysisAdapter", `analyzePricingPageCompletion (AUDIT) START for "${persona.name}"`, {
      tokenLimit,
      hasHtml: !!pageHtml,
      htmlLength: pageHtml?.length || 0,
      screenshotLength: screenshotBase64.length,
    });

    this.ensureIngested(persona, options.runId);

    const query = pageHtml ? `Pricing page about ${pageHtml.slice(0, 200)}` : "Evaluating a pricing page";
    const ragStart = Date.now();
    const ragContext = this.ragService.retrieveContext(persona, query, 3);
    const ragDuration = Date.now() - ragStart;
    log?.info("VisionAnalysisAdapter", `[AUDIT] ID-RAG retrieval for "${persona.name}"`, {
      chunkCount: ragContext.chunkCount,
      contextStringLength: ragContext.contextString.length,
      durationMs: ragDuration,
    });

    const compileStart = Date.now();
    const compartments = this.promptCompiler.compileSystemPrompt(persona);
    const personaAnchor = this.promptCompiler.generateAnchor(persona);
    const compileDuration = Date.now() - compileStart;
    log?.info("VisionAnalysisAdapter", `[AUDIT] Prompt compilation for "${persona.name}"`, {
      compartmentsLength: compartments.length,
      anchor: personaAnchor,
      durationMs: compileDuration,
    });

    const system = `You are a specialized JSON-only agent evaluating a pricing page as a specific persona.
        
        ${compartments}
        
        <<ANALYSIS TASK>>
        You are looking at a pricing page. You have been provided with:
        1. A screenshot of the exact viewport containing the pricing.
        2. A verified factual summary of the page's HTML (including product info, tier data, and fine print).
        
        ${ragContext.contextString ? `<<RETRIEVED MEMORY>>\n${ragContext.contextString}\n` : ""}
        
        <<PERSONALITY BIAS APPLICATION>>
        Your personality profile drives how you evaluate. Apply it aggressively:
        - Your Neuroticism determines how many risks you flag and how severe.
        - Your Conscientiousness determines how much fine print you read.
        - Your Openness determines whether new features excite or concern you.
        - Your Extraversion determines whether you seek team validation.
        - Your Agreeableness determines whether you give benefit of doubt.
        These are WHO YOU ARE. Your scores must reflect your personality.
        
        <<OPENNESS PRIMING>>
        ${personaAnchor} You're open to this. You're approaching this as someone who COULD use a tool like this. A skeptical but fair assessment.
        
        CALIBRATION — Let YOUR pricing sensitivity, domain expertise, and typical budget drive your reaction.
        
        STRICT OUTPUT RULES:
        - Respond ONLY with a valid JSON object following the PricingAnalysis schema.
        - Use standard JSON double quotes (") for all keys and string values.
        - Escape any literal double quotes within strings using a backslash (\").
        - NO conversational preamble. NO monologue. NO text before or after the JSON.
        - The 'thoughts' field MUST be limited to roughly ${Math.floor(tokenLimit * 0.75)} tokens.
        - RISKS: Limit to 3 items. Write from your (the persona's) perspective — what concerns you about this page? Ground each risk in something specific.
        - RECOMMENDATIONS: These are NOT your personal reflections. These are directives YOU are writing TO THE COMPANY — suggestions for what they should change on their pricing page. Write imperative sentences like "Add a monthly billing option" or "Remove the annual lock-in." Do NOT write "Check if..." or "Look for..." — you are not advising yourself. You are telling the company what to fix. Do NOT use first person here.
        - AI SUGGESTION: Write ONE persona-specific actionable insight in YOUR (the persona's) voice. This is THE ONE THING this company should change to win YOU over. Reference something specific you saw on the page. Write it as YOUR suggestion, e.g. "As a small business owner, I'd want to see..." or "I'd need to see..." — keep it in first person, grounded in your persona.
        - For every score, provide both the number AND a 1-2 sentence reason.
         - NO REPETITION: Do NOT repeat information across different fields.
         
         STRUCTURED THOUGHTS FORMAT:
         Inside your 'thoughts' field, structure your analysis using these markers:
         [The Good] — What works well. Specific positive observations.
         [The Bad] — What doesn't work. Specific criticisms.
         [The Dealbreaker] — The single biggest reason you would NOT buy.
         
         INTENT FUNNEL: explorationIntent >= analysisIntent >= buyIntent.
        - explorationIntent: Would you explore this further?
        - analysisIntent: Would you deep-dive or trial it?
        - buyIntent: Would you actually purchase?
        
        SCORES → REASONS → NARRATIVE. Each score needs a rationale.
        
        Different personas MUST give DIFFERENT scores based on their unique Big Five, values, and fears.
        Consistency is mandatory. If you feel skeptical, your scores must reflect that.
        
        SPEAK IN FIRST PERSON for gutReaction, thoughts, risks, score reasons, and aiSuggestion. Be blunt, honest, and natural. Be your persona. EXCEPTION: recommendations are NOT first person — they are directives to the company (see RECOMMENDATIONS rule above).`;

    try {
      log?.info("VisionAnalysisAdapter", `[AUDIT] Sending schema-guided completion for "${persona.name}"...`, {
        model: this.llmService.visionModel,
        systemPromptLength: system.length,
        maxTokens: tokenLimit,
      });

      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 2_000;
      const prompt = `Evaluate this pricing page. ${pageHtml ? `\n\nPAGE FACT SUMMARY:\n"""\n${pageHtml}\n"""` : ""}`;
      const ANALYSIS_TIMEOUT_MS = 180_000;

      let analysisObj: any = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          log?.info("VisionAnalysisAdapter", `[AUDIT] Retry attempt ${attempt}/${MAX_RETRIES} for "${persona.name}" — waiting ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }

        const completionStart = Date.now();
        const streamResult = streamObject({
          model: this.llmService.provider(this.llmService.visionModel),
          schema: PricingAnalysisSchema,
          schemaName: "PricingAnalysis",
          schemaDescription: "A detailed evaluation of a pricing page from a persona's perspective.",
          system,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: screenshotBase64 },
              ],
            },
          ],
          temperature: 0.1,
          maxTokens: tokenLimit,
        } as any);
        // Drain the partial stream (keeps the pipeline flowing — without a consumer,
        // streamObject's internal TransformStream stalls) while racing against a
        // timeout so a hanging LLM never blocks the queue permanently.
        // Drain the stream in the background WITH a catch handler — when the
        // timeout wins the race, the loser's streamResult.object must be caught
        // to prevent an unhandled promise rejection (the LLM may still respond).
        const drainAndResolve = (async () => {
          for await (const _ of streamResult.partialObjectStream) {
            // Discard partials — we only need the final validated object.
          }
          return streamResult.object;
        })().catch(() => null);
        analysisObj = await Promise.race([
          drainAndResolve,
          new Promise<any>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Analysis timed out after ${ANALYSIS_TIMEOUT_MS}ms`)),
              ANALYSIS_TIMEOUT_MS,
            ),
          ),
        ]);

        if (analysisObj) break;

        log?.warn("VisionAnalysisAdapter", `[AUDIT] Null result for "${persona.name}" on attempt ${attempt + 1}/${MAX_RETRIES + 1} — will ${attempt < MAX_RETRIES ? "retry" : "fall through to fallback"}`);
      }

      const completionDuration = Date.now() - methodStart;
      log?.info("VisionAnalysisAdapter", `[AUDIT] Analysis completed for "${persona.name}"`, {
        durationMs: completionDuration,
        scores: analysisObj.scores ? {
          clarity: analysisObj.scores.clarity,
          valuePerception: analysisObj.scores.valuePerception,
          trust: analysisObj.scores.trust,
          explorationIntent: analysisObj.scores.explorationIntent,
          analysisIntent: analysisObj.scores.analysisIntent,
          buyIntent: analysisObj.scores.buyIntent,
        } : null,
      });
      console.log(`[TRACE] [AnalysisComplete] persona=${persona.name}, scores=${JSON.stringify(analysisObj.scores)}, risks=${analysisObj.risks?.length ?? 0}`);
      return analysisObj;
    } catch (e) {
      const totalDuration = Date.now() - methodStart;
      log?.error("VisionAnalysisAdapter", `[AUDIT] Error for "${persona.name}"`, {
        error: String(e),
        totalDurationMs: totalDuration,
      });
      return {
        gutReaction:
          "Overall, this audit could not be completed due to a system issue.",
        thoughts: "An error occurred during pricing analysis.",
        scores: {
          clarity: 1,
          clarityReason: "System error — analysis could not be completed.",
          valuePerception: 1,
          valuePerceptionReason: "System error — analysis could not be completed.",
          trust: 1,
          trustReason: "System error — analysis could not be completed.",
          explorationIntent: 1,
          explorationIntentReason: "System error — analysis could not be completed.",
          analysisIntent: 1,
          analysisIntentReason: "System error — analysis could not be completed.",
          buyIntent: 1,
          buyIntentReason: "System error — analysis could not be completed.",
        },
        risks: ["[SYSTEM] LLM completion or analysis failed"],
        recommendations: [],
        aiSuggestion: "System error — analysis could not be completed.",
      };
    }
  }
}
