import OpenAI from "openai";
import pLimit from "p-limit";
import { LlmServicePort, PricingLocation } from "@/domain/ports/LlmServicePort";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { PersonaAdapter } from "./PersonaAdapter";
import { VisionAnalysisAdapter } from "./VisionAnalysisAdapter";
import { ChatAdapter } from "./ChatAdapter";
import { ExtractionAdapter } from "./ExtractionAdapter";
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
  private extractionAdapter: ExtractionAdapter;

  // OpenRouter Defaults
  private static readonly OR_TEXT_MODEL = "qwen/qwen3.5-9b";
  private static readonly OR_SMALL_TEXT_MODEL = "qwen/qwen3.5-flash-02-23";
  private static readonly OR_VISION_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";
  private static readonly OR_SCOUT_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";
  private static readonly OR_EXTRACTION_MODEL = "qwen/qwen3.5-flash-02-23";

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
    this.extractionAdapter = new ExtractionAdapter(this);
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
    const stream = await this.withRetry(async () => {
      const reqId = ++LlmServiceImpl.requestCount;
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

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
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
