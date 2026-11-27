import { z } from "zod";
import type { Persona } from "@/domain/entities/Persona";
import type { ExtractedClaim, ClaimSupport } from "@/domain/entities/PersonaClaim";
import type { SynthesisDraft, SynthesisPlan } from "@/domain/entities/SynthesisPlan";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import type { LlmServiceImpl } from "./LlmServiceImpl";
import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import { isCompletedPersonaResponse } from "@/domain/entities/PersonaResponse";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";

/**
 * The claim-ledger passes: claim extraction, the batch support gate, batch
 * clustering, and the plan writer. Each pass has one job and returns JSON;
 * code decides what the JSON is allowed to change.
 */

const STAGE_ENUM = z.enum(["interpretation", "understanding", "belief", "motivation", "action"]);

const ExtractedClaimSchema = z.object({
  topic: z.string().min(1),
  observation: z.string().min(1),
  stance: z.enum(["supports", "opposes", "neutral"]),
  quote: z.string().min(1),
  stage: STAGE_ENUM.optional(),
});

function asArray(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) return candidate;
    }
    return [value];
  }
  return [];
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
    throw new Error("The model returned no JSON object");
  }
}

const ClaimPassSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { claims: value } : value),
  z.object({
    claims: z.preprocess(
      (value) => asArray(value, ["claims"]),
      z.array(ExtractedClaimSchema),
    ),
  }),
);

const SupportBatchSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { results: value } : value),
  z.object({
    results: z.preprocess(
      (value) => asArray(value, ["results", "claims"]),
      z.array(
        z.object({
          claimId: z.string().min(1),
          level: z.enum(["support", "partial", "unsupported"]),
          reason: z.string().default(""),
        }),
      ),
    ),
  }),
);

const ClusterBatchSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { groups: value } : value),
  z.object({
    groups: z.preprocess(
      (value) => asArray(value, ["groups", "clusters"]),
      z.array(
        z.object({
          topic: z.string().min(1),
          claimIds: z.preprocess(
            (value) => (Array.isArray(value) ? value : []),
            z.array(z.union([z.string(), z.number()]).transform(String)),
          ),
        }),
      ),
    ),
  }),
);

const SummarySchema = z.object({
  overview: z.string().default(""),
  researchQuestionAnswer: z.string().default(""),
});

const ReasonAuditSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { results: value } : value),
  z.object({
    results: z.preprocess(
      (value) => asArray(value, ["results", "reasons"]),
      z.array(
        z.object({
          personaId: z.string().min(1),
          decisiveReason: z.string().default(""),
        }),
      ),
    ),
  }),
);

const SynthesisDraftSchema = z.object({
  overview: z.string().default(""),
  researchQuestionAnswer: z.string().default(""),
  findings: z.preprocess(
    (value) => asArray(value, ["findings"]),
    z.array(
      z.object({
        groupId: z.string().min(1),
        observation: z.string().default(""),
        impact: z.string().default(""),
      }),
    ),
  ),
  disagreements: z.preprocess(
    (value) => asArray(value, ["disagreements", "splits"]),
    z.array(
      z.object({
        groupId: z.string().min(1),
        supportsLabel: z.string().default(""),
        opposesLabel: z.string().default(""),
      }),
    ),
  ),
  frictions: z.preprocess(
    (value) => asArray(value, ["frictions"]),
    z.array(
      z.object({
        groupId: z.string().min(1),
        text: z.string().default(""),
      }),
    ),
  ),
});

const CLAIM_PROMPT = `You are reading one simulated customer's think-aloud transcript.

TASK:
Extract 3 to 7 assertions the persona actually makes about the artifact.
Return a JSON object: { "claims": [{ "topic": string, "observation": string, "stance": "supports" | "opposes" | "neutral", "quote": string, "stage"?: "interpretation" | "understanding" | "belief" | "motivation" | "action" }] }

RULES:
1. One claim per assertion. If the transcript makes two separate points, return two claims.
2. "observation" is one sentence, at most 25 words, naming the artifact element (price, line, screen, state) and what the persona concluded about it. Do not combine two reactions with "and".
3. "topic" is a short mechanism phrase naming the element and its effect, not a category noun.
4. "stance" is the persona's direction on that topic, not your opinion.
5. "quote" MUST be a complete sentence copied CHARACTER-FOR-CHARACTER from the transcript. No quote, no claim.
6. Do NOT add a fact, a number, a verdict, or a recommendation that the transcript does not contain. Any number in "observation" must also appear in "quote".
7. Write in English.`;

const SUPPORT_PROMPT = `You verify whether a quotation supports a claim.

For each claim, compare the observation with the quotation from the same persona's transcript:
- "support": the quotation supports the observation as written.
- "partial": the quotation supports part of the observation, or only a weaker version.
- "unsupported": the quotation does not support the observation, or supports the opposite.

Return a JSON object: { "results": [{ "claimId": string, "level": "support" | "partial" | "unsupported", "reason": string }] }

RULES:
1. Use the quotation only. No outside knowledge.
2. Do not add facts, soften the observation, or rewrite the claim.
3. Reason is one short sentence.
4. Return exactly one result per claim id supplied.`;

const CLUSTER_PROMPT = `You group claims by the mechanism that would change the product.

You receive claim ids with a topic and an observation. Group claims about the same artifact element and the same judgment, even when they notice different facets of it.
A support and an oppose on the same element belong in one group: the split is the point. Do NOT merge different artifact elements or different mechanisms; keep them apart even when both make a persona hesitate. If two claims name different screens, states, or causes, keep them apart.

Return a JSON object: { "groups": [{ "topic": string, "claimIds": string[] }] }

RULES:
1. Every claim id may appear at most once, or not at all.
2. Do not create claims, edit claims, or invent ids.
3. "topic" is a short mechanism phrase naming the element and its effect, not a category noun.
4. Write in English.`;

const SYNTHESIS_PROMPT = `You write the wording of one cohort research report from a verified plan.

The plan holds the supported groups, their exact counts, their claim observations, their quotations, the artifact profile facts, and the verdict tally. You provide language only. Code fills the counts, citations, and splits after your answer.

Return a JSON object:
{
  "overview": string,
  "researchQuestionAnswer": string,
  "findings": [{ "groupId": string, "observation": string, "impact": string }],
  "disagreements": [{ "groupId": string, "supportsLabel": string, "opposesLabel": string }],
  "frictions": [{ "groupId": string, "text": string }]
}

RULES:
1. Return exactly one finding per group in "findings", one disagreement per group in "splits", and one friction per group in "frictions", using the exact groupId. Do not invent a group.
2. State the behavior or mechanism first. Do not write a tally: never use "N of M personas weighed / responded / mentioned / focused on". Put the exact count in the sentence only when it clarifies the strength, using the plan's values. Never write a different count, a percentage, a persona name, or a quotation that is not in the plan. Role labels (economic buyer, daily user, blocker, champion) are allowed; names are not.
3. Observation: at most 30 words, one sentence. Name the artifact element and what the personas did or concluded about it. When the plan's artifact profile states the element, copy its exact value. Do not open with "Several personas", do not use category nouns (trust, clarity, credibility, transparency, friction) as the subject, and do not list each persona's version — the citations carry the variants. If a group has both support and opposition, state both sides and their counts; never describe a split group as one view.
4. Impact: at most 25 words. State what this changes for the reader's decision: what they will not do, will test, will pay for, will forward, or which requirement they will set. It must add a consequence, never restate the observation. Do not invent a number, a range ("two or three", "a few"), or a timeframe ("this week", "within a week") that the plan does not state. Do not end with "will ask" or "will want to know" unless you name the concrete answer that changes the decision. Never use "acted as a barrier", "raised concerns", "caused hesitation", "viewed as", "stopped several personas", "highlighted", or "underscored".
5. Every finding must name the mechanism that distinguishes it from the other findings. Do not repeat one sentence with a different topic; if two groups would lead to the same fix, say what the reader would change in each case.
6. Split labels: state the reason each side holds in its own terms; do not use "support" or "oppose" as the label. Use the claim observations; no names.
7. Friction: one sentence naming the exact surface and what the group's own claim observations say the reader did. Do not add a consequence, timeframe, number, or action the claims do not state. Do not repeat the overview or a finding.
8. Overview: 2 to 4 sentences. Every sentence must restate a finding or friction above, or the verdict tally. Do not introduce a new topic, question, number, screen, or artifact fact. Start with the strongest supported finding and its exact count. Do not write "The cohort examined", "Across the completed personas", or "unresolved questions". If the plan has no splits, do not use the word "split"; describe the disagreement as findings.
9. Research answer: answer the research question directly with the top two findings and their exact counts, then the strongest countervailing finding and its count. No new topics.
10. Do NOT make recommendations. Describe what the cohort did and what it means for the decision, not what a company should do.
11. If the plan has no supported finding, say so in the overview and leave findings empty.
12. Write in English.`;

const SUMMARY_PROMPT = `You write the summary of a cohort research report from verified findings.

INPUT: JSON with researchQuestion, completedCount, verdicts, findings, and frictions. Each finding carries its observation, impact, affectedPersonaCount, and totalPersonaCount.

Return a JSON object: { "overview": string, "researchQuestionAnswer": string }

RULES:
1. Every sentence must restate a finding, a friction, or the verdict tally. Do not introduce a new topic, question, number, screen, or artifact fact.
2. Preserve each finding's direction and its mix. If a finding reports both sides, keep both; never turn it into unanimous agreement or rejection.
3. Lead with the strongest behavior or mechanism, not an inventory of counts. Use a count only when it clarifies strength. Overview: 2 to 4 sentences. Research answer: 2 to 3 sentences with the top two findings and the verdict tally.
4. Use only counts present in the input. Do not make recommendations.
5. If there are no findings, say that no supported finding reached the floor.
6. Write in English.`;

const REASON_AUDIT_PROMPT = `You audit a persona's decisive reason against the transcript it came from.

INPUT: a JSON list with personaId, transcript, verdict, and decisiveReason.

Return a JSON object: { "results": [{ "personaId": string, "decisiveReason": string }] }

RULES:
1. Every noun, number, tool, person, and event in the reason must appear in that persona's own transcript. Remove anything else.
2. Keep the recorded verdict. If the draft reason conflicts with the verdict, rewrite the reason to match the verdict.
3. One sentence, third person. Do not add a fact, number, quotation, or recommendation.
4. Never return an empty reason: if the draft is unsupported, use the transcript sentence that best explains the recorded verdict, without adding anything.
5. Return exactly one result per personaId supplied.
6. Write in English.`;

const REPAIR_PROMPT = `You repair a cohort report draft that failed mechanical validation.

You receive the verified plan, the current draft, and the exact violations. Fix only the listed fields.
Return the FULL corrected draft in the same JSON shape. Do not add a fact, count, quotation, persona name, or recommendation.
Every finding starts with its exact plan count. Every impact states a decision consequence and does not restate the observation.
Write in English.`;

/**
 * Thin LLM adapter for the claim ledger. It owns wire schemas and prompts;
 * the use cases own ordering, retries, and every decision about what counts.
 */
export class ClaimLedgerAdapter {
  constructor(private readonly llmService: LlmServiceImpl) {}

  private async callJson(prompt: string, purpose: string, timeoutMs: number, runId?: string): Promise<unknown> {
    const content = await Promise.race([
      this.llmService.createChatCompletion(
        [{ role: "user", content: prompt }],
        {
          temperature: 0.2,
          model: this.llmService.client?.baseURL?.includes("openrouter")
            ? "deepseek/deepseek-v4-pro"
            : this.llmService.textModel,
          response_format: { type: "json_object" },
          purpose,
          runId,
        },
      ),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`${purpose} timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return parseJson(content);
  }

  async extractPersonaClaims(
    persona: Persona,
    monologue: string,
    options?: { runId?: string },
  ): Promise<ExtractedClaim[]> {
    const log = options?.runId ? AnalysisLogger.forRun(options.runId) : null;
    const prompt = `${CLAIM_PROMPT}

PERSONA: ${persona.name}, ${persona.occupation}

TRANSCRIPT:
"""${monologue}"""

Return ONLY the JSON object.`;
    const parsed = ClaimPassSchema.parse(
      await this.callJson(prompt, `Claim Pass — ${persona.name}`, 240_000, options?.runId),
    );
    // The prompt asks for 3-7; a shorter set is still evidence. A longer set is
    // trimmed so the ledger and its batch calls stay bounded.
    const claims = parsed.claims.filter((claim) => claim.quote.trim() && claim.observation.trim()).slice(0, 7);
    log?.info("ClaimLedgerAdapter", `Claim pass completed for "${persona.name}"`, {
      claims: claims.length,
    });
    return claims;
  }

  async verifyClaimSupport(
    claims: Array<{ claimId: string; observation: string; quote: string }>,
    options?: { runId?: string },
  ): Promise<ClaimSupport[]> {
    if (claims.length === 0) return [];
    const prompt = `${SUPPORT_PROMPT}

CLAIMS:
${JSON.stringify(claims, null, 2)}

Return ONLY the JSON object.`;
    const parsed = SupportBatchSchema.parse(
      await this.callJson(prompt, "Claim Support Gate", 240_000, options?.runId),
    );
    return parsed.results;
  }

  async clusterClaims(
    claims: Array<{ claimId: string; topic: string; observation: string }>,
    options?: { runId?: string },
  ): Promise<Array<{ topic: string; claimIds: string[] }>> {
    if (claims.length === 0) return [];
    const prompt = `${CLUSTER_PROMPT}

CLAIMS:
${JSON.stringify(claims, null, 2)}

Return ONLY the JSON object.`;
    const parsed = ClusterBatchSchema.parse(
      await this.callJson(prompt, "Claim Clustering", 240_000, options?.runId),
    );
    return parsed.groups;
  }

  async synthesizeFromPlan(plan: SynthesisPlan, options?: { runId?: string }): Promise<SynthesisDraft> {
    const prompt = `${SYNTHESIS_PROMPT}

PLAN:
${JSON.stringify(plan)}

Return ONLY the JSON object.`;
    return SynthesisDraftSchema.parse(
      await this.callJson(prompt, "Synthesis From Plan", 420_000, options?.runId),
    );
  }

  async repairSynthesis(
    plan: SynthesisPlan,
    draft: SynthesisDraft,
    violations: string[],
    options?: { runId?: string },
  ): Promise<SynthesisDraft> {
    const prompt = `${REPAIR_PROMPT}

PLAN:
${JSON.stringify(plan)}

CURRENT DRAFT:
${JSON.stringify(draft)}

VIOLATIONS:
${violations.map((violation) => `- ${violation}`).join("\n")}

Return ONLY the corrected JSON object.`;
    return SynthesisDraftSchema.parse(
      await this.callJson(prompt, "Repair Synthesis", 240_000, options?.runId),
    );
  }

  async summarizeReport(
    plan: SynthesisPlan,
    report: ArtifactSynthesis,
    options?: { runId?: string },
  ): Promise<{ overview: string; researchQuestionAnswer: string }> {
    const input = {
      researchQuestion: plan.researchQuestion,
      completedCount: report.completedCount,
      verdicts: report.verdicts,
      findings: report.topFindings.map((finding) => ({
        observation: finding.observation,
        impact: finding.impact,
        affectedPersonaCount: finding.affectedPersonaCount,
        totalPersonaCount: finding.totalPersonaCount,
      })),
      frictions: report.biggestFrictions,
    };
    const prompt = `${SUMMARY_PROMPT}

INPUT:
${JSON.stringify(input, null, 2)}

Return ONLY the JSON object.`;
    return SummarySchema.parse(
      await this.callJson(prompt, "Report Summary", 240_000, options?.runId),
    );
  }

  async auditPersonaReasons(
    responses: PersonaResponse[],
    options?: { runId?: string },
  ): Promise<Array<{ personaId: string; decisiveReason: string }>> {
    const completed = responses.filter(
      (response) => isCompletedPersonaResponse(response) && response.rawAnalysis,
    );
    if (completed.length === 0) return [];
    const input = completed.map((response) => ({
      personaId: response.personaId ?? response.id,
      verdict: response.verdict ?? "undecided",
      decisiveReason: response.decisiveReason ?? "",
      transcript: response.rawAnalysis,
    }));
    const prompt = `${REASON_AUDIT_PROMPT}

PERSONAS:
${JSON.stringify(input, null, 2)}

Return ONLY the JSON object.`;
    const parsed = ReasonAuditSchema.parse(
      await this.callJson(prompt, "Persona Reason Audit", 300_000, options?.runId),
    );
    return parsed.results;
  }
}
