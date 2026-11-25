import { describe, it, expect } from "vitest";
import { buildClaimLedger, collectVerbatimClaims } from "../ledger";
import type { LedgerResponse } from "../ledger";

function response(overrides: Partial<LedgerResponse> = {}): LedgerResponse {
  return {
    personaId: "p-1",
    personaName: "Sarah Chen",
    transcript: "I opened the pricing page and nearly choked. The free plan is missing.",
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

describe("collectVerbatimClaims", () => {
  it("drops a quotation that is not an exact substring", () => {
    const collected = collectVerbatimClaims([
      response({
        claims: [
          {
            id: "p-1:0",
            personaId: "p-1",
            topic: "price",
            observation: "The price is too high.",
            stance: "opposes",
            quote: "The price felt like a punch in the gut.",
          },
        ],
      }),
    ]);
    expect(collected.kept).toHaveLength(0);
    expect(collected.rejected[0].reason).toContain("verbatim");
  });

  it("records a persona whose claim pass produced no claims", () => {
    const collected = collectVerbatimClaims([response({ claims: [] })]);
    expect(collected.missingClaimPersonaIds).toEqual(["p-1"]);
  });
});

describe("buildClaimLedger", () => {
  it("drops an unsupported claim so it cannot set a count", () => {
    const ledger = buildClaimLedger({
      responses: [response()],
      supports: [{ claimId: "p-1:0", level: "unsupported", reason: "The quote says the opposite." }],
      clusters: [{ topic: "price", claimIds: ["p-1:0"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });

    expect(ledger.groups).toEqual([]);
    expect(ledger.rejectedClaims).toHaveLength(1);
    expect(ledger.rejectedClaims[0].level).toBe("unsupported");
  });

  it("counts one persona once even when it makes two claims on the topic", () => {
    const ledger = buildClaimLedger({
      responses: [
        response({
          claims: [
            {
              id: "p-1:0",
              personaId: "p-1",
              topic: "price",
              observation: "The price is too high.",
              stance: "opposes",
              quote: "I opened the pricing page and nearly choked.",
            },
            {
              id: "p-1:1",
              personaId: "p-1",
              topic: "price",
              observation: "The price is too high for the value.",
              stance: "opposes",
              quote: "The free plan is missing.",
            },
          ],
        }),
      ],
      supports: [
        { claimId: "p-1:0", level: "support", reason: "ok" },
        { claimId: "p-1:1", level: "support", reason: "ok" },
      ],
      clusters: [{ topic: "price", claimIds: ["p-1:0", "p-1:1"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });

    expect(ledger.groups[0].personaCount).toBe(1);
    expect(ledger.groups[0].opposes).toBe(1);
    expect(ledger.groups[0].citations).toHaveLength(1);
  });

  it("keeps a supported claim the clustering pass omitted as a one-claim group", () => {
    const ledger = buildClaimLedger({
      responses: [response()],
      supports: [{ claimId: "p-1:0", level: "support", reason: "ok" }],
      clusters: [{ topic: "other", claimIds: ["unknown-id"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });

    expect(ledger.groups).toHaveLength(1);
    expect(ledger.groups[0].personaCount).toBe(1);
    expect(ledger.groups[0].topic).toBe("price");
  });

  it("treats a missing support result as unsupported", () => {
    const ledger = buildClaimLedger({
      responses: [response()],
      supports: [],
      clusters: [{ topic: "price", claimIds: ["p-1:0"] }],
      failedCount: 0,
      totalPersonaCount: 1,
    });
    expect(ledger.groups).toEqual([]);
    expect(ledger.rejectedClaims[0].reason).toContain("No support result");
  });

  it("keeps the verdict counts summing to the completed count", () => {
    const ledger = buildClaimLedger({
      responses: [response({ verdict: "adopt" }), response({ personaId: "p-2" })],
      supports: [],
      clusters: [],
      failedCount: 1,
      totalPersonaCount: 3,
    });
    expect(ledger.verdicts.adopt + ledger.verdicts.undecided).toBe(ledger.completedCount);
    expect(ledger.verdicts.undecided).toBe(1);
  });
});
