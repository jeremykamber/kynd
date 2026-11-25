import { Persona } from "@/domain/entities/Persona";
import { PersonaResponseSchema, personaIdentityViolations } from "@/domain/entities/PersonaResponse";
import type { ArtifactFraming, ArtifactIntake } from "@/domain/entities/ArtifactIntake";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { sanitizeJourneyAnchors } from "@/domain/entities/StageJourney";
import type { SimulationFrame } from "@/domain/entities/SimulationFrame";
import { parseArtifactProfile, type ArtifactProfile } from "@/domain/entities/ArtifactProfile";
import { LlmServiceImpl } from "./LlmServiceImpl";
import { streamObject } from "ai";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

// Matches runs of CJK, Hangul, Kana, Cyrillic, Arabic, and Hebrew. Used to
// catch personas or formatters that drift out of the report language (English).
const NON_LATIN_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0600-\u06ff\u0590-\u05ff\u0400-\u04ff]{2,}/g;

function detectNonLatin(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(NON_LATIN_RE) ?? []) {
    found.add(m.slice(0, 24));
  }
  return [...found];
}

/**
 * System 1 — the Actor. Exported so tests can assert on the prompt
 * contract without LLM mocks. Identity comes from this small template:
 * the compartment system prompt is the over-rationalization source, so it
 * is deliberately absent from this path.
 */
export function buildVisceralMonologueSystemPrompt(
    persona: Persona,
    researchQuestion: string,
    artifact?: ArtifactFraming,
    frame?: SimulationFrame,
): string {
    // Persona maps: role = occupation, background = backstory, goal = the
    // persona's goals list (no single goal field exists on the entity);
    // when the persona has none, the research question is the browsing intent.
    const browsingIntent = persona.goals?.length
        ? persona.goals.join("; ")
        : researchQuestion;
    const background = persona.backstory || persona.occupation;
    const isDocument = artifact?.kind === "document";
    const brand = artifact?.name
        ? isDocument
            ? `The document you are reading is called "${artifact.name}" — that's its name; refer to it as such.\n`
            : `The site you're on is called "${artifact.name}" — that's its name; read it and use it.\n`
        : "";
    // The only artifact-kind framing: a document is read, a site is visited.
    // Everything else — what kind of document it is, what to look for — stays
    // with the persona, inferred from the text and the research question.
    // The role changes what this persona examines first. The frame carries no
    // verdict and no verdict set: the persona reacts, code counts the decision
    // later. "not stated" is the honest value for an absent alternative.
    const roleBlock = frame
        ? `THIS RUN'S ROLE — ${frame.decisionRole}:
- ${frame.roleTask}
- Start where this role starts: ${frame.entryPoint}
- What you use today instead: ${frame.currentAlternative ?? "not stated"}
- What would make you switch: ${frame.switchingTrigger ?? "not stated"}
- Do not decide a final verdict, score, or recommendation. Just react.
`
        : "";
    const medium = isDocument
        ? `- You are reading a document, not browsing a website. There is no screen and no buttons: react to the words — the claims, the numbers, the names, the gaps, the parts you skip. You read top to bottom, jump back when something snags, and stop when you have seen enough.
- You judge with your own life, not like an editor. If a claim doesn't apply to you, notice it and move on. If it sounds fake, call it fake. If it would make you act — reply, forward it, ask for a call — say why, in your own selfish terms.
- This is reading a document, not a memoir. Reactions come from your work, money, and time — the actual texture of your life. Do NOT invent cinematic detail (smells, weather, dead relatives, candlelight); a real person reading a document mostly notices what's ON the page.`
        : `- You judge with your own life, not like a reviewer. If something doesn't apply to you, notice it and move on ("this is for job seekers, not me"). If a claim sounds fake, call it fake. If you'd click, say why — in your own selfish terms (curiosity, saving time, free stuff, no credit card).
- This is a website visit, not a memoir. Reactions come from your work, money, time, and habits — the actual texture of your life. Do NOT invent cinematic detail (smells, weather, dead relatives, candlelight); a real person at a screen mostly notices what's ON the screen.`;

return `You are ${persona.name}, ${persona.occupation}.
Background: ${background} | You are ${isDocument ? "reading this because" : "browsing because"}: ${browsingIntent}
${brand}${roleBlock}
HOW YOUR INNER VOICE WORKS:
- Write like a person thinking, not a person performing. Short bursts. Half-thoughts. "Okay, green background. Looks clean, maybe a little sterile." — that's the register. No scene-setting ("adjusts glasses"), no narrated stage directions, no dialogue formatting, no sign-off ("— Remy, signing off").
- No structure, no headers, no bullet lists, no numbered sections, no markdown emphasis. Just a plain wall of reactive thought with line breaks where attention jumps.
- Never use consultant words — no "CTA", "social proof", "value proposition", "friction", "conversion", "call to action", "design choice". You have never heard them. You just see things: "big black button that says Try for free", "Product Hunt badges", "2M users".
- You skim like a real person. Big text first, then whatever looks interesting, then maybe the fine print if you still care. You skip things and admit it. You get confused, irritated, or bored, and you say so bluntly ("come on, nothing takes under a minute, that's total marketing BS").
${medium}
- You do NOT summarize the ${isDocument ? "document" : "page"}, score it, or conclude with an overall verdict. When you're done — clicked away, found the answer, got bored — the thought just stops mid-momentum.
- React, don't report. First person, present tense, impatient, a little messy.

Start wherever your ${isDocument ? "attention catches" : "eyes land"} first:`;
}

/**
 * System 2 — the Anthropologist. Exported so tests can assert on the prompt
 * contract without LLM mocks. Sees the raw monologue text ONLY — no image,
 * no page summary — so every statement is grounded in what the persona said.
 * Rule 4 exists because validatePersonaResponse enforces exactly 5 ordered
 * stages; a skipped stage is expressed through its outcome, never by omission.
 */
/**
 * Structured extraction needs more output room than the monologue it reads:
 * 2,000 tokens truncates a verbose report mid-JSON (observed: one persona
 * failing every retry with "could not parse the response" while the rest of
 * the cohort parsed), and a truncated stream looks identical to a model error.
 * The caller's tokenLimit is the monologue budget, so it cannot be reused here.
 */
const EXTRACTION_MIN_OUTPUT_TOKENS = 8_000;

/**
 * The Visceral Actor must sound like a person, not a UX consultant; the
 * monologue prompt already bans these terms. Real runs still slip ("friction"
 * in one of eight persona monologues), so the loop re-prompts when it hears
 * one instead of accepting the framing.
 */
export const MONOLOGUE_BANNED_TERMS = ['cta', 'social proof', 'value proposition', 'value prop', 'friction', 'conversion funnel', 'user journey map'];

export function bannedMonologueTerms(text: string): string[] {
    const lower = text.toLowerCase();
    return MONOLOGUE_BANNED_TERMS.filter((term) => lower.includes(term));
}

export function buildPersonaExtractionSystemPrompt(
    persona: Persona,
    monologue: string,
    researchQuestion: string,
    artifact?: ArtifactFraming,
    frame?: SimulationFrame,
    profile?: ArtifactProfile,
    artifactText?: string,
): string {
    const artifactName = artifact?.name
        ? `- The ${artifact.kind === "document" ? "document" : "site/product"} being evaluated is named "${artifact.name}" — always spell it exactly this way when you mention it.\n`
        : "";
    return `You are a Lead Qualitative UX Researcher analyzing a think-aloud session recording.

TASK:
Map ${persona.name}'s unfiltered behavior into the structured JSON schema.

INPUTS:
- Research Question: ${researchQuestion}
${artifactName}- Raw Think-Aloud Transcript: """${monologue}"""

RULES:
1. Write strictly in the THIRD PERSON ("The user observed...", "They grew skeptical of...").
2. Ground every statement entirely in the transcript. Never invent UI elements not mentioned in it.
3. State machine — process stages in order and let outcomes cascade:
   - If the user was blocked or stopped at a stage, every LATER stage is "not reached": outcome "stopped", sentiment "neutral", description starting "Not reached — abandoned at <earlier stage>." followed by the specific reason from the transcript.
   - Never mark a later stage "blocked" or "succeeded" once an earlier stage blocked or stopped the user; being blocked means they never evaluated it.
   - Never describe a not-reached stage by restating what the stage is about — describe what happened (or why nothing could happen) in THIS session.
4. The five journey stages MUST all appear in canonical order (interpretation, understanding, belief, motivation, action); skipping is expressed through outcomes, not omission.
5. Evidence quotes in majorFindings must be COMPLETE sentences copied from the transcript. Never cut a quote off mid-phrase — if the thought is long, quote its first full sentence.
6. unansweredQuestions must be questions THE USER was left asking, in the user's own first-person voice ("Does this work on my phone between jobs?"), not researcher hypotheses about the user ("Would the user have...?"). If the transcript shows no open questions, return an empty list.
7. Name the persona in overview and researchQuestionAnswer ("${persona.name}…"). Never write "the user" in those two fields, and never adopt a name, role, occupation, or pronoun that the artifact assigns to someone — the persona's identity comes from their profile, not from the artifact's copy.
8. Return one verdict for this persona from the FIXED set: adopt, trial, reject, undecided. Do not invent another verdict. A role never implies a verdict; a blocker can adopt and an economic buyer can reject.
9. Return decisiveReason as one sentence naming why this persona decided as it did, and decisiveReasonQuote as a COMPLETE sentence copied character-for-character from the transcript that supports that reason. No quote, no reason.
10. This run's role is ${frame?.decisionRole ?? "daily_user"}. The artifact may address a reader with a different role; do not adopt the artifact's assigned role.${frame ? `\n11. Decision question: ${frame.decisionQuestion}\n12. Start from this role's entry point: ${frame.entryPoint}` : ""}${profile ? `\n13. Content kind: ${profile.contentKind}.` : ""}${profile && profile.stageAnchorKind !== "none" && artifactText ? `\n\nARTIFACT ANCHOR SOURCE — use this only to copy an anchor value; never to add a finding:\n"""\n${artifactText.slice(0, 6000)}\n"""` : ""}${profile ? (profile.stageAnchorKind === "none" ? `\n14. Do not add a stage anchor: this artifact has no text location to anchor to.` : `\n14. Stage anchors: add anchor {kind: "${profile.stageAnchorKind}", value} to a stage only when you can copy the exact ${profile.stageAnchorKind === "timestamp" ? "timestamp" : profile.stageAnchorKind} from the artifact. For a video, timestamps must rise across the stages you reach. Omit the anchor rather than guess.`) : ""}`;
}

/**
 * Artifact-analysis sub-adapter behind LlmServiceImpl. Runs the two-stage
 * think-aloud pipeline — a persona reacts to the screenshot (visceral
 * monologue), then the same text is mapped to a PersonaResponse — plus cohort
 * synthesis across all transcripts. Prompts come from the exported
 * buildVisceralMonologueSystemPrompt/buildPersonaExtractionSystemPrompt
 * functions; completions and the vision LLM call go to its owning
 * LlmServiceImpl (and through it the OpenAI-compatible provider). Internal to
 * the LLM adapter, not a port implementation.
 */
export class VisionAnalysisAdapter {
    constructor(private llmService: LlmServiceImpl) {}

    /**
     * Reads the artifact once, before any persona. Extracts only what the
     * artifact states so later stages can check facts and choose the decision
     * question. Rejects on an unusable payload; the use case falls back.
     */
    async extractArtifactProfile(
        context: ArtifactIntake,
        artifact: ArtifactFraming,
        options: { tokenLimit?: number; runId?: string } = {},
    ): Promise<ArtifactProfile> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const isDocument = artifact.kind === "document";
        if (isDocument && context.text === undefined) {
            throw new Error("Cannot profile a document: the artifact carries no text");
        }
        if (!isDocument && !context.screenshotBase64) {
            throw new Error("Cannot profile a site: the artifact carries no screenshot");
        }

        const system = `You extract the artifact profile for a user-research simulation.

Return ONLY a JSON object with this shape:
{
  "contentKind": "landing_page" | "feature_brief" | "pitch_deck" | "marketing_copy" | "video_script" | "document" | "other",
  "facts": [{ "kind": "product"|"audience"|"offer"|"price"|"tier"|"claim"|"cta"|"proof", "label": string, "value": string, "sourceQuote": string, "source": "text"|"screenshot", "amount"?: number, "currency"?: string, "period"?: "month"|"year"|"one_time" }],
  "openQuestions": string[],
  "stageAnchorKind": "timestamp" | "heading" | "quote" | "none",
  "confidence": "high" | "medium" | "low"
}

RULES:
- contentKind is decided by what the artifact is: a script or transcript with time markers is video_script; a page that asks for a CTA is landing_page; a deck is pitch_deck; a product brief is feature_brief; standalone copy is marketing_copy; anything else is document or other.
- facts are ONLY what the artifact states. sourceQuote MUST be copied word-for-word from the text. For a screenshot, set source "screenshot" and quote the visible wording. Never fill a fact from general knowledge.
- A price fact MUST include amount, currency, and period when stated.
- openQuestions are facts a reader would need but the artifact leaves out. Do not answer them.
- stageAnchorKind: "timestamp" only for a video script whose text carries time markers; "heading" or "quote" for text; "none" when there is no text to anchor to.
- confidence is how completely the artifact itself supports the profile.`;

        const content = isDocument
            ? [{ type: "text" as const, text: `Artifact text:\n"""\n${context.text}\n"""` }]
            : [
                { type: "text" as const, text: "Read this artifact and extract its profile." },
                { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${context.screenshotBase64}` } },
            ];

        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const raw = await this.llmService.createChatCompletion(
                    [
                        { role: "system", content: system },
                        { role: "user", content: content as never },
                    ],
                    {
                        temperature: 0.1,
                        max_tokens: options.tokenLimit ?? 2000,
                        model: isDocument ? this.llmService.textModel : this.llmService.visionModel,
                        purpose: "Artifact Profile",
                        runId: options.runId,
                    },
                );
                const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
                const start = cleaned.indexOf("{");
                const end = cleaned.lastIndexOf("}");
                if (start < 0 || end <= start) throw new Error("Artifact profile response has no JSON object");
                const profile = parseArtifactProfile(JSON.parse(cleaned.slice(start, end + 1)));
                log?.info("VisionAnalysisAdapter", "Artifact profile extracted", {
                    contentKind: profile.contentKind,
                    facts: profile.facts.length,
                    anchor: profile.stageAnchorKind,
                    degraded: profile.degraded.length,
                });
                return profile;
            } catch (error) {
                lastError = error as Error;
                log?.warn("VisionAnalysisAdapter", `Artifact profile attempt ${attempt + 1} failed`, {
                    error: String(error),
                });
            }
        }
        throw lastError ?? new Error("Artifact profile failed");
    }

    async generateVisceralMonologue(
        persona: Persona,
        context: ArtifactIntake,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string; artifact?: ArtifactFraming; frame?: SimulationFrame } = {},
    ): Promise<{ text: string }> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 120_000;
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 3_000;

        log?.info("VisionAnalysisAdapter", `generateVisceralMonologue START for "${persona.name}"`, { tokenLimit });

        const system = buildVisceralMonologueSystemPrompt(persona, researchQuestion, options.artifact, options.frame);
        // Screenshot ONLY for visual artifacts. Deliberately not
        // context.summary/pageHtml: the actor must react to visual salience,
        // not DOM-structure facts it could never see in a first glance —
        // over-informed personas rationalize instead of reacting. A text
        // artifact has no screenshot at all; its full text is the user content.
        // The framing decides the medium; the payload is checked against it so
        // prompt and content cannot disagree.
        const streamStart = Date.now();
        const isDocument = options.artifact?.kind === "document";
        if (isDocument && context.text === undefined) {
            throw new Error("Cannot run a document monologue: the artifact carries no text");
        }
        if (!isDocument && !context.screenshotBase64) {
            throw new Error("Cannot run a site monologue: the artifact carries no screenshot");
        }
        const content = isDocument
            ? [{ type: "text" as const, text: `Read this document and think aloud as ${persona.name}.\n\n"""\n${context.text}\n"""` }]
            : [
                { type: "text" as const, text: `Experience this artifact. Think aloud as ${persona.name}.` },
                { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${context.screenshotBase64}` } },
            ];

        let lastError: Error | null = null;
        let correction: string | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.warn("VisionAnalysisAdapter", `generateVisceralMonologue retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }

            try {
                const text = await Promise.race([
                    this.llmService.createChatCompletion(
                        [
                            {
                                role: "system",
                                content: system,
                            },
                            {
                                role: "user",
                                content: correction
                                    ? ([
                                        ...(content as any[]),
                                        { type: "text", text: correction },
                                    ] as any)
                                    : (content as any),
                            },
                        ],
                        {
                            temperature: 0.7,
                            max_tokens: tokenLimit,
                            // A document is read by the text model; only a
                            // visual artifact needs the vision model.
                            model: isDocument ? this.llmService.textModel : this.llmService.visionModel,
                            purpose: `Visceral Monologue — ${persona.name}`,
                            runId: options.runId,
                        }
                    ),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Visceral monologue timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
                    ),
                ]);

                const banned = bannedMonologueTerms(text);
                if (banned.length > 0 && attempt < MAX_RETRIES) {
                    log?.warn("VisionAnalysisAdapter", `generateVisceralMonologue jargon in "${persona.name}"`, {
                        attempt: attempt + 1,
                        banned,
                    });
                    correction = `Rewrite the monologue. Never use these words: ${banned.join(", ")}. Speak the way a person thinks: describe what you see and how it lands, not what a researcher would call it.`;
                    continue;
                }

                log?.info("VisionAnalysisAdapter", `generateVisceralMonologue completed for "${persona.name}"`, {
                    durationMs: Date.now() - streamStart,
                    textLength: text.length,
                });

                return { text };
            } catch (e) {
                lastError = e as Error;
                log?.warn("VisionAnalysisAdapter", `generateVisceralMonologue attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw lastError;
            }
        }

        throw lastError || new Error("generateVisceralMonologue failed after all retries");
    }

    async extractPersonaResponse(
        persona: Persona,
        monologueText: string,
        researchQuestion: string,
        options: { tokenLimit?: number; runId?: string; artifact?: ArtifactFraming; frame?: SimulationFrame; profile?: ArtifactProfile; artifactText?: string } = {},
    ): Promise<PersonaResponse> {
        const log = options.runId ? AnalysisLogger.forRun(options.runId) : null;
        const tokenLimit = options.tokenLimit ?? 2000;
        const TIMEOUT_MS = 240_000; // generous hard cap — legitimate big extractions reached 153s
        const STALL_TIMEOUT_MS = 45_000; // no chunk for 45s = provider stall; abort and retry
        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 2_000;

        log?.info("VisionAnalysisAdapter", `extractPersonaResponse START for "${persona.name}"`, {
            monologueLength: monologueText.length,
        });

        // Text model, no image: the anthropologist must ground every claim in
        // the transcript, not re-interpret the screenshot.
        const system = buildPersonaExtractionSystemPrompt(persona, monologueText, researchQuestion, options.artifact, options.frame, options.profile, options.artifactText);
        const basePrompt = `Analyze the think-aloud transcript above and return the structured PersonaResponse JSON.`;

        let responseObj: unknown = null;
        // Carried into the next attempt: a retry with the identical prompt
        // reproduced the same identity slip three times in real runs.
        let correction: string | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                log?.info("VisionAnalysisAdapter", `extractPersonaResponse retry ${attempt}/${MAX_RETRIES} for "${persona.name}"`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }
            try {
                // provider.chat() → Chat Completions endpoint. The default
                // provider() factory routes to OpenRouter's /responses
                // endpoint, where deepseek runs with chain-of-thought (the
                // reasoning-disable fetch hook below only intercepts
                // /chat/completions): 90-240s+ extractions and 240s timeouts
                // under load. provider.chat + the hook's reasoning off is
                // ~10x faster on identical prompts and schemas.
                const controller = new AbortController();
                // The caller's tokenLimit is the monologue budget, which is too
                // small for the structured report: a verbose persona (7 findings
                // plus five stages) truncates mid-JSON and the SDK reports
                // "could not parse the response" on every retry. Give the
                // extraction its own floor instead of inheriting the cap.
                const outputTokenBudget = Math.max(tokenLimit, EXTRACTION_MIN_OUTPUT_TOKENS);
                const streamResult = streamObject({
                    model: this.llmService.provider.chat(this.llmService.textModel),
                    schema: PersonaResponseSchema,
                    schemaName: "PersonaResponse",
                    schemaDescription: "A third-person qualitative analysis of a persona's think-aloud session across five cognitive stages.",
                    system,
                    messages: [{ role: "user", content: correction ? `${basePrompt}\n\n${correction}` : basePrompt }],
                    temperature: 0.1,
                    // AI SDK v6 renamed this option. `maxTokens` (v5) is
                    // ignored, so the provider fell back to the model maximum
                    // (131,072 tokens) and OpenRouter refused the call for
                    // insufficient credit before a single token was generated.
                    maxOutputTokens: outputTokenBudget,
                    abortSignal: controller.signal,
                } as unknown as Parameters<typeof streamObject>[0]);

                let timeoutId: NodeJS.Timeout | undefined;
                let watchdogId: NodeJS.Timeout | undefined;
                // Inter-chunk watchdog: a healthy structured-output stream
                // emits chunks continuously; a provider stall emits nothing
                // for minutes while the hard timeout (sized for legitimate
                // 150s+ completions) burns the whole budget. Detect silence
                // in seconds, abort, and let the retry recover the persona.
                const resetWatchdog = (): void => {
                    clearTimeout(watchdogId);
                    watchdogId = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
                };
                const drainAndResolve = (async () => {
                    for await (const _ of streamResult.partialObjectStream) {
                        resetWatchdog();
                    }
                    return streamResult.object;
                })().catch((streamErr: unknown) => {
                    // Surface the real cause (NoObjectGeneratedError on
                    // truncation, 429/5xx mid-stream, schema drift, stall
                    // abort) — a silent null here cost a full diagnosis.
                    log?.warn("VisionAnalysisAdapter", `extractPersonaResponse stream failed for "${persona.name}"`, {
                        error: String(streamErr),
                    });
                    return null;
                });

                responseObj = await Promise.race([
                    drainAndResolve,
                    new Promise<never>((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error(`Extraction timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
                    }),
                ]).finally(() => {
                    // A stalled/hung stream must not keep running into the
                    // retry: cancel it and stop its timeout timer.
                    clearTimeout(timeoutId);
                    clearTimeout(watchdogId);
                    controller.abort();
                });

                if (responseObj) {
                    // One corrective retry when the summary layers lose the
                    // persona's identity (no name, "the user", first person).
                    // After that the response is kept: a labelled-but-imperfect
                    // report beats a missing persona, and the violation is
                    // logged for the run report.
                    const violations = personaIdentityViolations(
                        responseObj as PersonaResponse,
                        persona.name,
                    );
                    if (violations.length === 0) break;
                    log?.warn("VisionAnalysisAdapter", `extractPersonaResponse identity drift for "${persona.name}"`, {
                        attempt: attempt + 1,
                        violations,
                    });
                    correction = `Your previous answer broke the identity rules: ${violations.join("; ")}. Rewrite the whole JSON so that overview and researchQuestionAnswer both name ${persona.name} explicitly, refer to ${persona.name} in the third person, and never use "the user" or a first-person pronoun in those two fields.`;
                    if (attempt === MAX_RETRIES) break;
                    continue;
                }
            } catch (e) {
                log?.warn("VisionAnalysisAdapter", `extractPersonaResponse attempt ${attempt + 1} failed for "${persona.name}"`, {
                    error: String(e),
                });
                if (attempt === MAX_RETRIES) throw e;
            }
        }

        if (!responseObj) {
            throw new Error(`extractPersonaResponse returned null for "${persona.name}"`);
        }

        const nonLatinFields = detectNonLatin(JSON.stringify(responseObj));
        if (nonLatinFields.length > 0) {
            log?.warn("VisionAnalysisAdapter", `Non-English output detected for "${persona.name}"`, {
                samples: nonLatinFields.slice(0, 3),
            });
        }

        const response = responseObj as PersonaResponse;
        if (options.profile) {
            response.customerJourney = sanitizeJourneyAnchors(
                response.customerJourney,
                options.profile,
                options.artifactText,
            );
        }

        log?.info("VisionAnalysisAdapter", `extractPersonaResponse completed for "${persona.name}"`);

        return response;
    }

}
