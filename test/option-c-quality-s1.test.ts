import { describe, it, expect, vi } from "vitest";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import type { ClaimSupport } from "@/domain/entities/PersonaClaim";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { BuildClaimLedgerUseCase } from "@/application/usecases/BuildClaimLedgerUseCase";
import { SynthesizeArtifactResultsUseCase } from "@/application/usecases/SynthesizeArtifactResultsUseCase";
import { buildClaimLedger } from "@/application/synthesis/ledger";
import { buildArtifactSynthesis, buildSynthesisPlan } from "@/application/synthesis/plan";

function response(
  id: string,
  observation: string,
  quote: string,
  stance: "supports" | "opposes" | "neutral",
  overrides: Partial<PersonaResponse> = {},
): PersonaResponse {
  return {
    id: `resp-${id}`,
    personaId: id,
    rawAnalysis: quote,
    overview: "ok",
    customerJourney: [],
    researchQuestionAnswer: "",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name: `Persona ${id}`,
      occupation: "Engineer",
      bigFive: { conscientiousness: 50, neuroticism: 50, openness: 50, extraversion: 50, agreeableness: 50 },
      values: [],
      fears: [],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
    },
    claims: [{ id: `${id}:0`, personaId: id, topic: "price", observation, stance, quote }],
    ...overrides,
  };
}

function toLedger(r: PersonaResponse) {
  return {
    personaId: r.personaId ?? r.id,
    personaName: r.personaProfile?.name ?? "Unnamed persona",
    transcript: r.rawAnalysis,
    claims: r.claims,
  };
}

describe("S1 acceptance: claim ledger", () => {
  it("drops an inverted claim so it cannot count", () => {
    const ledger = buildClaimLedger({
      responses: [
        toLedger(response("p-1", "The price is fair.", "I nearly choked at the price.", "supports")),
      ],
      supports: [{ claimId: "p-1:0", level: "unsupported", reason: "The quote says the opposite." }],
      clusters: [{ topic: "price", claimIds: ["p-1:0"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "",
      researchQuestionAnswer: "",
      findings: [{ groupId: "g1", observation: "The price is fair.", impact: "" }],
      disagreements: [],
      frictions: [],
    });

    expect(ledger.groups).toEqual([]);
    expect(plan.findings).toEqual([]);
    expect(synthesis.topFindings).toEqual([]);
  });

  it("produces a complete split that includes No clear view", () => {
    const claims: ClaimSupport[] = [
      { claimId: "p-1:0", level: "support", reason: "ok" },
      { claimId: "p-2:0", level: "support", reason: "ok" },
      { claimId: "p-3:0", level: "support", reason: "ok" },
    ];
    const ledger = buildClaimLedger({
      responses: [
        toLedger(response("p-1", "Worth it.", "I would pay for this.", "supports")),
        toLedger(response("p-2", "Too expensive.", "That is too much money.", "opposes")),
        toLedger(response("p-3", "Not sure.", "I need to think about it.", "neutral")),
      ],
      supports: claims,
      clusters: [{ topic: "price", claimIds: ["p-1:0", "p-2:0", "p-3:0"] }],
      failedCount: 0,
      totalPersonaCount: 3,
    });
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "",
      researchQuestionAnswer: "",
      findings: [],
      disagreements: [{ groupId: "g1", supportsLabel: "Worth it", opposesLabel: "Too expensive" }],
      frictions: [],
    });

    const split = synthesis.disagreements[0].split;
    expect(split.reduce((sum, side) => sum + side.personaCount, 0)).toBe(3);
    expect(split.some((side) => side.view === "No clear view")).toBe(true);
    expect(split.find((side) => side.view === "Neutral")?.personaCount).toBe(1);
  });

  it("fails the run when the support gate fails twice", async () => {
    const llm = {
      verifyClaimSupport: vi.fn().mockRejectedValue(new Error("gate down")),
    } as unknown as LlmServicePort;

    await expect(new BuildClaimLedgerUseCase(llm).execute([response("p-1", "x", "x", "supports")]))
      .rejects.toMatchObject({ name: "ClaimSupportUnavailableError" });
    expect(llm.verifyClaimSupport).toHaveBeenCalledTimes(2);
  });

  it("keeps a rejected draft with warnings after one failed repair", async () => {
    const ledger = buildClaimLedger({
      responses: [toLedger(response("p-1", "Too expensive.", "That is too much money.", "opposes"))],
      supports: [{ claimId: "p-1:0", level: "support", reason: "ok" }],
      clusters: [{ topic: "price", claimIds: ["p-1:0"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger, personaNames: ["Persona p-1"] });
    const badDraft = {
      overview: "All 99 personas stopped.",
      researchQuestionAnswer: "",
      findings: [],
      disagreements: [],
      frictions: [],
    };
    const llm = {
      synthesizeFromPlan: vi.fn().mockResolvedValue(badDraft),
      repairSynthesis: vi.fn().mockResolvedValue(badDraft),
    } as unknown as LlmServicePort;

    const synthesis = await new SynthesizeArtifactResultsUseCase(llm).execute(plan);
    expect(synthesis.validationWarnings?.join(" ")).toContain("99");
    expect(synthesis.topFindings[0].affectedPersonaCount).toBe(1);
  });

  it("refuses a finding below the cohort-size floor", () => {
    const responses = Array.from({ length: 6 }, (_, i) =>
      response(`p-${i}`, "Too expensive.", "That is too much money.", "opposes"),
    );
    const ledger = buildClaimLedger({
      responses: responses.map(toLedger),
      supports: responses.map((r) => ({ claimId: r.claims![0].id, level: "support" as const, reason: "ok" })),
      clusters: [{ topic: "price", claimIds: responses.map((r) => r.claims![0].id) }],
      failedCount: 0,
      totalPersonaCount: 6,
    });
    // Only two of six carry the claim; the other four have no claim set.
    ledger.groups[0].personaCount = 2;
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger });
    expect(plan.findings).toEqual([]);
  });
});
