import { Persona } from "../entities/Persona";
import { PricingAnalysis } from "../entities/PricingAnalysis";
import { PersonaResponse } from "../entities/PersonaResponse";
import { ArtifactSynthesis, CohortSynthesisContent } from "../entities/ArtifactSynthesis";
import { ArtifactIntake } from "../entities/ArtifactIntake";
import { ExtractedInterviewSignals } from "@/application/interviewPipeline/types";
import type { ResearchPersonaConfig, StrategyPersonaConfig, ClusterPersonaConfig } from "../dtos/PersonaGenerationConfig";

/** One decision the browser-acting persona makes from the current screenshot. */
export type AgentAction =
    | { type: "CLICK"; selector: string; reasoning: string }
    | { type: "TYPE"; selector: string; text: string; reasoning: string }
    | { type: "FINISH"; report: string };

/**
 * Progress callback for phased persona generation.
 *
 * Phase 1 (`profiles`) is one batched call; phase 2 (`backstories`) is one
 * call per persona. Progress carries completed/total counts; personaName is
 * set during the backstories phase so callers can render per-persona ticks.
 */
export type PersonaPhase = "profiles" | "backstories";
export interface PersonaPhaseProgress {
    completed: number;
    total: number;
    personaName?: string;
}
export type PersonaPhaseCallback = (phase: PersonaPhase, progress?: PersonaPhaseProgress) => void;

/** @deprecated Pricing-specific — use generic artifact intake instead. */
export interface PricingLocation {
    found: boolean;
    selector?: string;
    anchorText?: string;
    reasoning?: string;
}

/**
 * Context a persona chat can be grounded in.
 *
 * `PricingAnalysis` is the legacy pricing-era type (kept for backward
 * compatibility with the old results flow); `PersonaResponse` is the modern
 * artifact-agnostic type produced by analyses — it is what "chat with a
 * persona about what they saw" is grounded in.
 */
export type ChatAnalysisContext = PricingAnalysis | PersonaResponse | null;

/**
 * The product's LLM-backed capabilities: persona generation, artifact
 * analysis extraction, cohort synthesis, and chat. It is a single port
 * because every capability is served by the same provider/credentials and
 * prompt infrastructure; an adapter is the LLM vendor, not a slice of the
 * product.
 *
 * Conventions that hold for every method:
 * - Streaming methods return an `AsyncIterable` of decoded text pieces (or,
 *   for `generateInitialPersonasStream`, of the running parse result); the
 *   iterable completes when the model stops and rejects on transport/model
 *   failure.
 * - Non-streaming methods resolve with the final value and reject on
 *   failure — no null/empty sentinel encodes an error.
 * - `options.runId`, where accepted, associates the call with an analysis run
 *   so its prompt/response are logged under that run; it is optional and
 *   never affects the result.
 */
export interface LlmServicePort {
    /**
     * Generates an array of initial personas based on the provided persona description.
     * @param personaDescription - A textual description of the persona(s) to generate.
     * @param count - How many personas to request; implementer default (5) when omitted.
     * @returns A promise that resolves to an array of Persona objects.
     */
    generateInitialPersonas(personaDescription: string, count?: number): Promise<Persona[]>;

    /**
     * Generates personas based on a description (streaming version).
     * Each yield is the array of personas parsed so far — elements may still
     * be missing fields and are replaced by later, more complete yields.
     */
    generateInitialPersonasStream(personaDescription: string, count?: number): AsyncIterable<Partial<Persona>[]>;

    /**
     * Generates a deep narrative backstory for a persona.
     * @param personaOrDescription - The Persona object or its description.
     * @param onProgress - Optional callback for tracking progress (part X of totalParts).
     * @returns A promise that resolves to the persona's backstory.
     */
    generatePersonaBackstory(
        personaOrDescription: Persona | string,
        onProgress?: (part: number, totalParts: number) => void,
    ): Promise<string>;

    /**
     * Generates a deep narrative backstory for a persona (streaming version).
     * Yields backstory text pieces in order.
     */
    generatePersonaBackstoryStream(
        personaOrDescription: Persona | string,
    ): AsyncIterable<string>;

    /**
     * Generates a much shorter, abbreviated backstory in a single LLM call.
     * Cheaper than `generatePersonaBackstory`; the returned text is the whole
     * backstory.
     */
    generateAbbreviatedBackstory(
        personaOrDescription: Persona | string,
    ): Promise<string>;

    /**
     * Generates an abbreviated backstory (streaming version).
     * Yields backstory text pieces in order.
     */
    generateAbbreviatedBackstoryStream(
        personaOrDescription: Persona | string,
    ): AsyncIterable<string>;

    /**
     * The Brain looks at the screenshot and history, then decides the next move.
     * @param persona The Persona object representing the agent.
     * @param screenshotBase64 A base64-encoded screenshot of the current view.
     * @param actionHistory An array of strings representing the history of actions taken so far.
     * @returns A promise that resolves to the next AgentAction to be taken.
     * @remarks Currently unimplemented: the sole adapter rejects. Callers must
     *   handle that rejection until an adapter provides it.
     */
    decideNextStep(
        persona: Persona,
        screenshotBase64: string,
        actionHistory: string[],
    ): Promise<AgentAction>;


    /**
     * Chat with a persona about their analysis (non-streaming).
     * @param persona The persona to chat with.
     * @param analysis The analysis they performed; null frames the chat as
     *   pre-testing (the persona has not seen the artifact).
     * @param message The user's message.
     * @param history The chat history.
     * @returns A promise that resolves to the persona's full response text.
     */
    chatWithPersona(
        persona: Persona,
        analysis: ChatAnalysisContext,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): Promise<string>;

    /**
     * Chat with a persona about their analysis (streaming version).
     * @param persona The persona to chat with.
     * @param analysis The analysis they performed (optional if pre-testing).
     * @param message The user's message.
     * @param history The chat history.
     * @returns An AsyncIterable of response text pieces.
     */
    chatWithPersonaStream(
        persona: Persona,
        analysis: ChatAnalysisContext,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string>;

    /**
     * Chat with the whole cohort at once (panel synthesis). Grounds the
     * answer in every persona's analysis response plus the cross-persona
     * synthesis, so questions like "what would our users think of X?" get an
     * evidence-backed synthesis rather than a single persona's take.
     * @param responses All persona responses from the analysis.
     * @param synthesis The cross-persona synthesis (may be null if unavailable).
     * @param message The user's message.
     * @param history The chat history.
     * @returns An AsyncIterable of response text pieces.
     */
    chatWithPanelStream(
        responses: PersonaResponse[],
        synthesis: ArtifactSynthesis | null,
        message: string,
        history: { role: "user" | "assistant"; content: string }[],
    ): AsyncIterable<string>;

    /**
     * System 1 — the Actor. Generates a visceral, first-person stream-of-
     * consciousness monologue of the persona experiencing the artifact,
     * grounded in the screenshot ONLY (visual salience over DOM structure).
     * @param context The captured artifact; only the screenshot is read.
     * @param researchQuestion The question the analysis must stay relevant to.
     * @param options.tokenLimit Caps the generated monologue length.
     * @returns The monologue text (may contain no page summary — this stage
     *   deliberately never sees DOM structure).
     */
    generateVisceralMonologue(
        persona: Persona,
        context: ArtifactIntake,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string; artifactName?: string }
    ): Promise<{ text: string }>;

    /**
     * System 2 — the Anthropologist. Maps the raw monologue into a
     * structured PersonaResponse, strictly third-person, grounded in the
     * transcript alone (no image, no page summary).
     * @param monologueText Output of `generateVisceralMonologue`.
     * @returns The parsed response; rejects when the model output cannot be
     *   parsed into the PersonaResponse structure.
     */
    extractPersonaResponse(
        persona: Persona,
        monologueText: string,
        researchQuestion: string,
        options?: { tokenLimit?: number; runId?: string; artifactName?: string }
    ): Promise<PersonaResponse>;


    // --- Cross-persona cohort synthesis ---

    /**
     * One structured LLM call over the cohort's RAW monologue transcripts:
     * overview, research-question answer, top findings (each carrying
     * evidence locators for code-side citation grounding), disagreements and
     * frictions. Findings and their evidence anchors ride in this same call
     * so the two can never disagree.
     *
     * The returned `CohortSynthesisContent` deliberately omits completion
     * counts — the caller owns those facts and fills them in.
     * @param transcripts One entry per persona that completed; findings
     *   reference personas by id/name, so array order does not affect output.
     */
    generateCohortSynthesis(
        researchQuestion: string,
        transcripts: Array<{ personaId: string; personaName: string; transcript: string }>,
        options?: { runId?: string }
    ): Promise<CohortSynthesisContent>;

    /**
     * Validates if a user's prompt is within the persona's expected domain.
     * Prevents requests for code, poetry, or other general assistant tasks.
     * @returns `isValid: false` with a human-readable `reason` when rejected.
     */
    validatePromptDomain(
        persona: Persona,
        prompt: string,
    ): Promise<{ isValid: boolean; reason?: string }>;

    /**
     * Batch version - generates backstories for all personas in a single LLM call.
     * @returns One backstory per input persona, same order as `personas`.
     */
    generateAbbreviatedBackstoriesBatch(personas: Persona[]): Promise<string[]>;

    /**
     * Condenses a page's HTML into a prompt-sized text summary.
     * @returns The summary; rejects on model failure.
     */
    summarizeHtml(html: string, runId?: string): Promise<string>;

    /**
     * Extracts structured signals from an interview transcript.
     * @param transcript - The raw interview transcript text.
     * @param interviewId - Unique identifier for the interview; used to label
     *   the extracted signals.
     * @returns Structured signals; rejects when the model output cannot be
     *   parsed.
     */
    extractInterviewSignals(transcript: string, interviewId: string): Promise<ExtractedInterviewSignals>;

    /**
     * Generic chat completion for ad-hoc LLM calls (e.g., coherence validation).
     * @param messages - The chat messages.
     * @param options.temperature - Sampling temperature; implementer default when omitted.
     * @param options.response_format - Request JSON or plain text output.
     * @param options.max_tokens - Completion cap; null means no explicit cap.
     * @param options.purpose - Label recorded with the call for logging.
     * @returns The assistant message text (not the raw provider response).
     */
    createChatCompletion(
        messages: { role: string; content: string }[],
        options?: {
            temperature?: number;
            response_format?: { type: "json_object" | "text" };
            max_tokens?: number | null;
            purpose?: string;
        },
    ): Promise<string>;

    /**
     * Generates a short, human-friendly title for a simulation from the research
     * context and the captured artifact. Uses the cheap vision model so it can
     * "see" the artifact (screenshot + page summary) the same way the analysis
     * does. Nice-to-have: callers must tolerate failure and fall back to the
     * heuristic name (generateSimulationName).
     */
    generateSimulationTitle(
        context: {
            businessGoal?: string;
            researchQuestion?: string;
            artifactUrl?: string;
            pageSummary?: string;
            screenshotBase64?: string;
        },
        options?: { runId?: string },
    ): Promise<string>;

    /**
     * Generates a short label for a persona batch from the personas' basic info
     * (name, occupation, backstory). Text-only and cheap — no vision needed.
     * Nice-to-have: callers must tolerate failure and fall back to the default.
     */
    generateBatchTitle(
        personas: Persona[],
        context: {
            source?: 'description' | 'interviews';
            description?: string;
            transcriptCount?: number;
        },
        options?: { runId?: string },
    ): Promise<string>;

    /**
     * Rationalizes personas using psychological scaffolds (PB&J): causal
     * rationales connecting Big Five profiles to values, fears, and decision
     * styles.
     * @param personas - The personas to rationalize. Mutated in place: the
     *   formatted rationales are appended to each persona's backstory.
     * @param contextNotes - Optional interview/source context to ground rationales in actual evidence.
     * @returns The same personas, with a persona left unchanged when its
     *   individual rationale call failed.
     */
    rationalizePersonas(personas: Persona[], contextNotes?: string): Promise<Persona[]>;

    /**
     * Generates persona variations based on a reference persona and adjusted traits.
     * The LLM receives the reference persona + adjusted Big Five + variation level,
     * and produces N new personas with fresh backstories, values, fears, etc.
     * @param referencePersona - The source persona to base variations on.
     * @param adjustments - Adjusted Big Five traits + variation level.
     * @param count - How many variations to generate (1, 3, or 5).
     * @returns The newly generated personas; none are the reference persona.
     */
    generateVariationPersonas(
        referencePersona: Persona,
        adjustments: { bigFive: { conscientiousness: number; neuroticism: number; openness: number; extraversion: number; agreeableness: number }; variationLevel: number },
        count: number,
    ): Promise<Persona[]>;

    /**
     * Infers Big Five traits and psychographic values from a persona's backstory.
     * Used when the user edits the backstory — suggests updated trait values that
     * are causally consistent with the new narrative. Suggestions only: nothing
     * is written back to the persona.
     * @param backstory - The new or edited backstory text.
     * @returns Suggested trait values derived from the backstory.
     */
    inferTraitsFromBackstory(backstory: string): Promise<{
        conscientiousness: number;
        neuroticism: number;
        openness: number;
        extraversion: number;
        agreeableness: number;
        values: string[];
        fears: string[];
        communicationStyle: string;
        decisionStyle: string;
    }>;

    // --- Dual-Mode Persona Generation (2025 Philosophy) ---

    /**
     * Research Mode: evidence-first persona generation from interview transcripts.
     * Produces personas with provenance tracking, minimal invention, no fabricated memories.
     * Phased: batched profiles, then per-persona parallel backstories.
     * @param onPhase - Optional progress callback (profiles -> backstories).
     * @param onRetry - Optional callback fired before a retry attempt of the
     *                  profiles batch (attempt 2+), so the UI can surface
     *                  that generation is retrying.
     */
    generateResearchPersonas(config: ResearchPersonaConfig, onPhase?: PersonaPhaseCallback, onRetry?: (attempt: number, attempts: number) => void): Promise<Persona[]>;

    /**
     * Strategy Mode: richer storytelling persona generation from ICP/market descriptions.
     * Representative assumptions allowed for imagination and decision-making.
     * Phased: batched profiles, then per-persona parallel backstories.
     * @param onPhase - Optional progress callback (profiles -> backstories).
     * @param onRetry - Optional callback fired before a retry attempt of the
     *                  profiles batch (attempt 2+), so the UI can surface
     *                  that generation is retrying.
     */
    generateStrategyPersonas(config: StrategyPersonaConfig, onPhase?: PersonaPhaseCallback, onRetry?: (attempt: number, attempts: number) => void): Promise<Persona[]>;

    /**
     * Cluster Mode: synthetic representative personas from multiple interview signals.
     * Produces labeled cluster personas with source references.
     * @returns `config.count` personas, each labeled with its cluster info.
     */
    generateClusterPersonas(config: ClusterPersonaConfig): Promise<Persona[]>;

    /**
     * Counterfactual test: checks whether synthetic persona details would change
     * product decisions. Details that fail this test should not influence decisions.
     * @returns The failing details, each with the reason it fails; an empty
     *   array means every synthetic detail survived the test.
     */
    applyCounterfactualTest(persona: Persona): Promise<{ detail: string; reason: string; attribute?: string }[]>;
}