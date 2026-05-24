import OpenAI from "openai";
import pLimit from "p-limit";
import { LlmServicePort, PricingLocation } from "@/domain/ports/LlmServicePort";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { PersonaAdapter } from "./PersonaAdapter";
import { VisionAnalysisAdapter } from "./VisionAnalysisAdapter";
import { ChatAdapter } from "./ChatAdapter";
import { HtmlSummarizer } from "./HtmlSummarizer";
import { PsychographicRationalizer } from "./PsychographicRationalizer";
import { Persona } from "@/domain/entities/Persona";
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis";

/**
 * Lean core implementation of the LlmServicePort that handles LLM plumbing.
 * Domain-specific logic is moved to specialized adapters.
 */
export class LlmServiceImpl implements LlmServicePort {
  public client: OpenAI;
  public provider: OpenAIProvider;
  public textModel: string;
  public smallTextModel: string;
  public visionModel: string;
  public scoutVisionModel: string;
  public extractionModel: string;
  private static requestCount = 0;
  public static readonly limiter = pLimit(20); // Increased for better parallelization

  private personaAdapter: PersonaAdapter;
  private visionAdapter: VisionAnalysisAdapter;
  private chatAdapter: ChatAdapter;
  private htmlSummarizer: HtmlSummarizer;

  // OpenRouter Defaults — using DeepSeek V4 Flash (fast, strong reasoning, same price)
  private static readonly OR_TEXT_MODEL = "deepseek/deepseek-v4-flash";
  private static readonly OR_SMALL_TEXT_MODEL = "deepseek/deepseek-v4-flash";
  private static readonly OR_VISION_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";
  private static readonly OR_SCOUT_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";
  private static readonly OR_EXTRACTION_MODEL = "deepseek/deepseek-v4-flash";

  // Ollama Defaults
  private static readonly OLLAMA_DEFAULT_MODEL = "gemma3:1b-it-qat";

  constructor(
    client: OpenAI,
    provider: OpenAIProvider,
    models: {
      text: string;
      smallText: string;
      vision: string;
      scout: string;
      extraction: string;
    },
  ) {
    this.client = client;
    this.provider = provider;
    this.textModel = models.text;
    this.smallTextModel = models.smallText;
    this.visionModel = models.vision;
    this.scoutVisionModel = models.scout;
    this.extractionModel = models.extraction;

    this.personaAdapter = new PersonaAdapter(this);
    this.visionAdapter = new VisionAnalysisAdapter(this);
    this.chatAdapter = new ChatAdapter(this);
    this.htmlSummarizer = new HtmlSummarizer(this);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        const status = (error as { status?: number }).status;
        const isRetryable =
          status === 429 || (status !== undefined && status >= 500);
        if (!isRetryable || i === maxRetries - 1) throw error;
        const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
        console.warn(
          `[LlmService] Retry ${i + 1}/${maxRetries} after ${Math.round(waitTime)}ms`,
        );
        await this.sleep(waitTime);
      }
    }
    throw lastError;
  }

  static createFromEnv(
    provider: "ollama" | "openrouter",
    overrides?: {
      text?: string;
      smallText?: string;
      vision?: string;
      scout?: string;
      extraction?: string;
    },
  ): LlmServiceImpl {
    const baseURL =
      provider === "ollama"
        ? process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1"
        : process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    const apiKey =
      provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
        : process.env.OLLAMA_API_KEY || "ollama";

    const client = new OpenAI({
      baseURL,
      apiKey: apiKey as string,
      dangerouslyAllowBrowser: true,
      maxRetries: 0,
    });
    const providerInstance = createOpenAI({
      baseURL,
      apiKey: apiKey as string,
    });

    const models =
      provider === "ollama"
        ? {
          text: overrides?.text || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
          smallText:
            overrides?.smallText || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
          vision: overrides?.vision || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
          scout: overrides?.scout || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
          extraction:
            overrides?.extraction || LlmServiceImpl.OLLAMA_DEFAULT_MODEL,
        }
        : {
          text: overrides?.text || LlmServiceImpl.OR_TEXT_MODEL,
          smallText:
            overrides?.smallText || LlmServiceImpl.OR_SMALL_TEXT_MODEL,
          vision: overrides?.vision || LlmServiceImpl.OR_VISION_MODEL,
          scout: overrides?.scout || LlmServiceImpl.OR_SCOUT_MODEL,
          extraction:
            overrides?.extraction || LlmServiceImpl.OR_EXTRACTION_MODEL,
        };

    return new LlmServiceImpl(client, providerInstance, models);
  }

  private shouldDisableThinking(model?: string): boolean {
    const modelToCheck = model || this.textModel;
    // DeepSeek V4 Flash has reasoning enabled by default — we want to capture it
    // Only disable for models that don't support reasoning or need it off
    return modelToCheck.toLowerCase().includes("qwen");
  }

  public async createChatCompletion(
    messages: any,
    options: {
      temperature?: number;
      max_tokens?: number | null;
      response_format?: { type: "json_object" | "text" };
      model?: string;
      purpose?: string;
    },
  ): Promise<string> {
    return this.withRetry(async () => {
      const reqId = ++LlmServiceImpl.requestCount;
      const purpose = options.purpose || "General";
      const model = options.model || this.textModel;
      console.log(
        `[LlmService] [Req #${reqId}] [${purpose}] Sending request to ${model}...`,
      );
      const startTime = Date.now();

      const requestParams: any = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? undefined,
        response_format: options.response_format,
      };

      if (this.shouldDisableThinking(model)) {
        requestParams.reasoning = { enabled: false };
      }

      const resp = await LlmServiceImpl.limiter(() =>
        this.client.chat.completions.create(requestParams),
      );

      console.log(
        `[LlmService] [Req #${reqId}] [${purpose}] Completed in ${Date.now() - startTime}ms.`,
      );

      // Capture and log reasoning tokens if present (DeepSeek V4 Flash)
      const reasoning = (resp?.choices?.[0]?.message as any)?.reasoning || (resp?.choices?.[0]?.message as any)?.reasoning_content;
      if (reasoning) {
        console.log(`[LlmService] [Req #${reqId}] [${purpose}] Reasoning (${reasoning.length} chars): ${reasoning.slice(0, 300)}...`);
      }

      return resp?.choices?.[0]?.message?.content || "";
    });
  }

  public async *createChatCompletionStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options: {
      temperature?: number;
      max_tokens?: number | null;
      response_format?: { type: "json_object" | "text" };
      model?: string;
      purpose?: string;
    },
  ): AsyncIterable<string> {
    let reqId = 0;
    const stream = await this.withRetry(async () => {
      reqId = ++LlmServiceImpl.requestCount;
      const purpose = options.purpose || "General";
      const model = options.model || this.textModel;
      console.log(
        `[LlmService] [Req #${reqId}] [${purpose}] Starting stream to ${model}...`,
      );

      const requestParams: any = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? undefined,
        response_format: options.response_format,
        stream: true,
      };

      if (this.shouldDisableThinking(model)) {
        requestParams.reasoning = { enabled: false };
      }

      return await this.client.chat.completions.create(requestParams);
    });

    const chunkStream = stream as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
    let debugLogged = false;
    let reasoningAccum = "";
    let contentStarted = false;
    for await (const chunk of chunkStream) {
      const delta = chunk.choices[0]?.delta as any;
      if (!debugLogged && delta && chunk.choices[0]?.finish_reason === null) {
        console.log(`[LlmService] [Req #${reqId}] FULL RAW CHUNK:`, JSON.stringify(chunk).slice(0, 500));
        debugLogged = true;
      }
      // Collect reasoning tokens across chunks
      const reasoning =
        delta?.reasoning_content ||
        delta?.reasoning ||
        (delta?.reasoning_details?.[0]?.text) ||
        (Array.isArray(delta?.reasoning_details) ? delta.reasoning_details.map((r: any) => r.text || "").join("") : null);
      if (reasoning) {
        reasoningAccum += reasoning;
      }
      const content = delta?.content;
      if (content) {
        // First content token: flush accumulated reasoning, then yield content
        if (reasoningAccum && !contentStarted) {
          yield `<<REASONING>>${reasoningAccum}<</REASONING>>`;
          reasoningAccum = "";
          contentStarted = true;
        }
        yield content;
      }
    }
    // Flush any remaining reasoning (in case content never came)
    if (reasoningAccum) {
      yield `<<REASONING>>${reasoningAccum}<</REASONING>>`;
    }
  }

  // --- Domain Gateways (Delegating to Adapters) ---

  async generateInitialPersonas(description: string) {
    return this.personaAdapter.generateInitialPersonas(description);
  }

  async *generateInitialPersonasStream(
    description: string,
  ): AsyncIterable<Partial<Persona>[]> {
    yield* this.personaAdapter.generateInitialPersonasStream(description);
  }

  async generatePersonaBackstory(
    persona: Persona | string,
    onProgress?: (p: number, t: number) => void,
  ): Promise<string> {
    return this.personaAdapter.generatePersonaBackstory(persona, onProgress);
  }

  async *generatePersonaBackstoryStream(
    persona: Persona | string,
  ): AsyncIterable<string> {
    yield* this.personaAdapter.generatePersonaBackstoryStream(persona);
  }

  async generateAbbreviatedBackstory(
    persona: Persona | string,
  ): Promise<string> {
    return this.personaAdapter.generateAbbreviatedBackstory(persona);
  }

  async *generateAbbreviatedBackstoryStream(
    persona: Persona | string,
  ): AsyncIterable<string> {
    yield* this.personaAdapter.generateAbbreviatedBackstoryStream(persona);
  }

  async generatePersonaInsight(persona: Persona): Promise<string> {
    return this.personaAdapter.generatePersonaInsight(persona);
  }

  async generateAbbreviatedBackstoriesBatch(personas: Persona[]): Promise<string[]> {
    return this.personaAdapter.generateAbbreviatedBackstoriesBatch(personas);
  }

  async generatePersonaInsightsBatch(personas: Persona[]): Promise<string[]> {
    return this.personaAdapter.generatePersonaInsightsBatch(personas);
  }

  /**
   * Rationalizes personas using psychological scaffolds (PB&J).
   * Generates psychological rationales that causally connect the persona's
   * Big Five profile to their values, fears, and decision style.
   * The rationales are appended to each persona's backstory.
   */
  async rationalizePersonas(personas: Persona[]): Promise<Persona[]> {
    const enhancer = new PsychographicRationalizer(this);
    const enhanced = await Promise.allSettled(
      personas.map(async (persona) => {
        const pbjText = await enhancer.rationalizeBackstory(persona);
        if (pbjText) {
          persona.backstory = (persona.backstory ?? "") + pbjText;
        }
        return persona;
      }),
    );
    return enhanced.map((r) => (r.status === "fulfilled" ? r.value : r.reason as any));
  }

  /**
   * Extracts structured signals from an interview transcript.
   * Delegates to InterviewSignalExtractor (implementation in Wave 2).
   */
  async extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals> {
    // TODO: Implement InterviewSignalExtractor in Wave 2
    throw new Error("extractInterviewSignals not yet implemented");
  }

  async isPricingVisible(screenshot: string): Promise<boolean> {
    return this.visionAdapter.isPricingVisible(screenshot);
  }

  async isPricingVisibleInHtml(html: string): Promise<PricingLocation> {
    return this.visionAdapter.isPricingVisibleInHtml(html);
  }

  async analyzePricingPageStream(
    persona: Persona,
    screenshot: string,
    html?: string,
    options?: { tokenLimit?: number }
  ): Promise<any> {
    return this.visionAdapter.analyzePricingPageStream(
      persona,
      screenshot,
      html,
      options,
    );
  }

  async *chatWithPersonaStream(
    persona: Persona,
    analysis: PricingAnalysis | null,
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ): AsyncIterable<string> {
    yield* this.chatAdapter.chatWithPersonaStream(
      persona,
      analysis,
      message,
      history,
    );
  }

  async validatePromptDomain(
    persona: Persona,
    prompt: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    return this.chatAdapter.validatePromptDomain(persona, prompt);
  }

  async summarizeHtml(html: string): Promise<string> {
    return this.extractionAdapter.summarizeHtml(html);
  }

  // --- Legacy / Compatibility ---

  async analyzeStaticPage(
    persona: Persona,
    screenshot: string,
  ): Promise<PricingAnalysis> {
    throw new Error(
      "analyzeStaticPage is deprecated. Use analyzePricingPageStream instead.",
    );
  }

  async *analyzeStaticPageStream(
    persona: Persona,
    screenshots: string[],
  ): AsyncIterable<string> {
    // Fallback for logic that still expects a raw string stream
    const result = await this.analyzePricingPageStream(persona, screenshots[0]);
    for await (const partial of result.partialObjectStream) {
      if (partial.thoughts) yield partial.thoughts;
    }
  }

  async extractInsights(
    persona: Persona,
    rawThoughts: string,
  ): Promise<Partial<PricingAnalysis>> {
    throw new Error(
      "extractInsights is deprecated. Use analyzePricingPageStream for consolidated results.",
    );
  }

  async chatWithPersona(
    persona: Persona,
    analysis: PricingAnalysis | null,
    msg: string,
    history: any,
  ): Promise<string> {
    let full = "";
    for await (const chunk of this.chatWithPersonaStream(
      persona,
      analysis,
      msg,
      history,
    )) {
      full += chunk;
    }
    return full;
  }

  async decideNextStep(): Promise<any> {
    throw new Error("decideNextStep is not implemented in this MVP branch.");
  }
}
