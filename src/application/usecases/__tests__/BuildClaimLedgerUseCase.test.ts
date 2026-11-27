import { describe, it, expect, vi } from "vitest";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import type { PersonaResponse } from "@/domain/entities/PersonaResponse";
import { BuildClaimLedgerUseCase, ClaimSupportUnavailableError } from "../BuildClaimLedgerUseCase";

function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: "resp-1",
    personaId: "p-1",
    rawAnalysis: "I opened the pricing page and nearly choked.",
    overview: "Pricing shock",
    customerJourney: [],
    researchQuestionAnswer: "",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name: "Sarah Chen",
      occupation: "Engineer",
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
      values: [],
      fears: [],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
    },
    claims: [
      {
        id: "p-1:0",
        personaId: "p-1",
        topic: "price",
        observation: "The price is too high.",
        stance: "opposes",
        quote: "I opened the pricing page and nearly choked.",
      },
    ],
    ...overrides,
  };
}

function port(overrides: Partial<LlmServicePort> = {}): LlmServicePort {
  return {
    verifyClaimSupport: vi.fn().mockResolvedValue([
      { claimId: "p-1:0", level: "support", reason: "The quote supports the observation." },
    ]),
    clusterClaims: vi.fn().mockResolvedValue([{ topic: "price", claimIds: ["p-1:0"] }]),
    ...overrides,
  } as unknown as LlmServicePort;
}

describe("BuildClaimLedgerUseCase", () => {
  it("retries the support gate once before accepting its result", async () => {
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue([{ claimId: "p-1:0", level: "support", reason: "ok" }]);
    const ledger = await new BuildClaimLedgerUseCase(port({ verifyClaimSupport: verify })).execute([
      response(),
    ]);

    expect(verify).toHaveBeenCalledTimes(2);
    expect(ledger.groups).toHaveLength(1);
  });

  it("fails the run when the support gate fails twice", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("provider down"));
    await expect(
      new BuildClaimLedgerUseCase(port({ verifyClaimSupport: verify })).execute([response()]),
    ).rejects.toBeInstanceOf(ClaimSupportUnavailableError);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("falls back to one-claim groups when clustering fails twice", async () => {
    const cluster = vi.fn().mockRejectedValue(new Error("provider down"));
    const ledger = await new BuildClaimLedgerUseCase(port({ clusterClaims: cluster })).execute([
      response(),
    ]);

    expect(cluster).toHaveBeenCalledTimes(2);
    expect(ledger.groups).toHaveLength(1);
    expect(ledger.groups[0].personaCount).toBe(1);
    expect(ledger.degraded.some((note) => note.includes("Clustering failed"))).toBe(true);
  });

  it("keeps a persona with no claim set in the completed count", async () => {
    const ledger = await new BuildClaimLedgerUseCase(port()).execute([
      response({ claims: undefined }),
    ]);
    expect(ledger.completedCount).toBe(1);
    expect(ledger.missingClaimPersonaIds).toEqual(["p-1"]);
  });

  it("copies each persona's verdict into the ledger tally", async () => {
    const ledger = await new BuildClaimLedgerUseCase(port()).execute([
      response({ verdict: "trial" }),
      response({ personaId: "p-2", claims: [], verdict: "reject" }),
      response({ personaId: "p-3", claims: [], verdict: "maybe" as unknown as PersonaResponse["verdict"] }),
    ]);
    expect(ledger.verdicts).toEqual({ adopt: 0, trial: 1, reject: 1, undecided: 1 });
  });
});
