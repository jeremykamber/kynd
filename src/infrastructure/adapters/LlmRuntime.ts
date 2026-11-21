import type { OpenAIProvider } from "@ai-sdk/openai";
import type OpenAI from "openai";

/**
 * Chat messages in OpenAI shape. Sub-adapters build multimodal content parts,
 * so this accepts the provider's parameter type as well as the plain
 * `{ role, content }` form that `LlmServicePort` declares.
 */
export type LlmMessages =
    | OpenAI.Chat.ChatCompletionMessageParam[]
    | { role: string; content: string }[];

/**
 * Per-call overrides for the two completion primitives. Every field is
 * optional: the runtime substitutes `textModel`, leaves the temperature to the
 * provider, and logs `purpose` with the request.
 */
export interface LlmCompletionOptions {
    temperature?: number;
    max_tokens?: number | null;
    response_format?: { type: "json_object" | "text" };
    /** Model id; defaults to {@link LlmRuntime.textModel}. */
    model?: string;
    /** Label recorded with the call in the analysis log. */
    purpose?: string;
    /** Analysis run this request belongs to; unset calls are not logged. */
    runId?: string;
    /**
     * Force chain-of-thought off for this call even when the model normally
     * reasons. The streaming primitive ignores it.
     */
    disableReasoning?: boolean;
}

/**
 * What an LLM sub-adapter may use: the provider client, the model ids that
 * prompts choose between, and the two completion primitives that carry retry,
 * rate limiting and request logging.
 *
 * `LlmServiceImpl` implements this. Sub-adapters depend on the interface, not
 * on `LlmServiceImpl`, so the service can construct its sub-adapters without an
 * import cycle, and so each sub-adapter's reach is stated in one place.
 */
export interface LlmRuntime {
    provider: OpenAIProvider;
    textModel: string;
    smallTextModel: string;
    strategyProfileModel: string;
    visionModel: string;
    extractionModel: string;

    /**
     * Runs one chat completion.
     * @param messages - Chat messages in OpenAI shape.
     * @returns The assistant message text, not the raw provider response.
     * @throws When the provider fails after the runtime's retries.
     */
    createChatCompletion(
        messages: LlmMessages,
        options: LlmCompletionOptions,
    ): Promise<string>;

    /**
     * Runs one streaming chat completion.
     * @param messages - Chat messages in OpenAI shape.
     * @returns The assistant text in arrival order; the stream ends when the
     *   provider stops sending deltas.
     */
    createChatCompletionStream(
        messages: OpenAI.Chat.ChatCompletionMessageParam[],
        options: LlmCompletionOptions,
    ): AsyncIterable<string>;
}
