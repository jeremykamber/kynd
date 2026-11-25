import { z } from "zod";
import type { Persona } from "@/domain/entities/Persona";
import type { ExtractedClaim, ClaimSupport } from "@/domain/entities/PersonaClaim";
import type { SynthesisDraft, SynthesisPlan } from "@/domain/entities/SynthesisPlan";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";
import type { LlmServiceImpl } from "./LlmServiceImpl";

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
1. "observation" is one sentence stating what the persona noticed or concluded.
2. "topic" is a short noun phrase naming the underlying issue; use the same topic for the same issue.
3. "stance" is the persona's direction on that topic, not your opinion.
4. "quote" MUST be a complete sentence copied CHARACTER-FOR-CHARACTER from the transcript. No quote, no claim.
5. Do NOT add a fact, a number, a verdict, or a recommendation that the transcript does not contain.
6. Write in English.`;

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

const CLUSTER_PROMPT = `You group claims by the underlying topic.

You receive claim ids with a topic and an observation. Group claims that make the same point.
Do NOT merge different causes: "the price is high" and "the free plan is missing" are different topics even when both make a persona hesitate.

Return a JSON object: { "groups": [{ "topic": string, "claimIds": string[] }] }

RULES:
1. Every claim id may appear at most once, or not at all.
2. Do not create claims, edit claims, or invent ids.
3. Use short noun-phrase topics.
4. Write in English.`;

const SYNTHESIS_PROMPT = `You write the wording of one cohort research report from a verified plan.

The plan already holds every count, citation, and artifact fact. You provide language only.
Return a JSON object:
{
  "overview": string,
  "researchQuestionAnswer": string,
  "findings": [{ "groupId": string, "observation": string, "impact": string }],
  "disagreements": [{ "groupId": string, "supportsLabel": string, "opposesLabel": string }],
  "frictions": [{ "groupId": string, "text": string }]
}

RULES:
1. Return one finding for every group in "findings", one disagreement for every group in "splits", and one friction for every group in "frictions", using its exact groupId.
2. Never write a count, percentage, persona name, or quotation that is not already in the plan. Code fills counts and citations after your answer.
3. Use group language ("Several personas...") and never name a persona.
4. Do NOT make recommendations. Describe what the cohort did, not what a company should do.
5. If the plan has no supported finding, say so in the overview and leave findings empty.
6. Write in English.`;

const REPAIR_PROMPT = `You repair a cohort report draft that failed mechanical validation.

You receive the verified plan, the current draft, and the exact violations. Fix only the listed fields.
Return the FULL corrected draft in the same JSON shape. Do not add a fact, count, quotation, persona name, or recommendation.
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
          model: this.llmService.textModel,
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
}
