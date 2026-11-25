import { describe, it, expect } from "vitest";
import type { ClaimLedger, ClaimGroup } from "@/domain/entities/PersonaClaim";
import { buildArtifactSynthesis, buildSynthesisPlan, findingFloor, planForWriter } from "../plan";

function group(overrides: Partial<ClaimGroup> = {}): ClaimGroup {
  return {
    id: "g1",
    topic: "Price opacity",
    claims: [],
    personaCount: 2,
    supports: 0,
    opposes: 2,
    neutral: 0,
    citations: [
      { personaId: "p-1", personaName: "Sarah Chen", quote: "I nearly choked at the price." },
    ],
    ...overrides,
  };
}

function ledger(overrides: Partial<ClaimLedger> = {}): ClaimLedger {
  return {
    groups: [group()],
    verdicts: { adopt: 0, trial: 1, reject: 1, undecided: 1 },
    completedCount: 3,
    failedCount: 0,
    totalPersonaCount: 3,
    missingClaimPersonaIds: [],
    rejectedClaims: [
      {
        claim: {
          id: "p-3:0",
          personaId: "p-3",
          topic: "price",
          observation: "Rejected claim",
          stance: "supports",
          quote: "not in transcript",
        },
        level: "unsupported",
        reason: "not verbatim",
      },
    ],
    degraded: [],
    ...overrides,
  };
}

describe("findingFloor", () => {
  it("scales with the cohort size", () => {
    expect(findingFloor(1)).toBe(1);
    expect(findingFloor(5)).toBe(2);
    expect(findingFloor(6)).toBe(3);
  });
});

describe("buildSynthesisPlan", () => {
  it("keeps two of five as a finding and refuses two of six", () => {
    const twoOfFive = buildSynthesisPlan({
      researchQuestion: "q",
      ledger: ledger({ completedCount: 5, totalPersonaCount: 5, verdicts: { adopt: 0, trial: 2, reject: 2, undecided: 1 } }),
    });
    expect(twoOfFive.findings).toHaveLength(1);

    const twoOfSix = buildSynthesisPlan({
      researchQuestion: "q",
      ledger: ledger({ completedCount: 6, totalPersonaCount: 6, verdicts: { adopt: 0, trial: 2, reject: 3, undecided: 1 } }),
    });
    expect(twoOfSix.findings).toHaveLength(0);
  });

  it("strips rejected claims and persona names before the writer sees the plan", () => {
    const plan = buildSynthesisPlan({
      researchQuestion: "q",
      ledger: ledger(),
      personaNames: ["Sarah Chen"],
    });
    const writerPlan = planForWriter(plan);
    expect(writerPlan.ledger.rejectedClaims).toEqual([]);
    expect(writerPlan.personaNames).toBeUndefined();
    expect(plan.ledger.rejectedClaims).toHaveLength(1);
  });
});

describe("buildArtifactSynthesis", () => {
  it("fills counts and citations from the group, not from the draft", () => {
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger: ledger() });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "Several personas stalled.",
      researchQuestionAnswer: "Price opacity blocks the next step.",
      findings: [{ groupId: "g1", observation: "Several personas stalled on the price.", impact: "Several personas stop before acting." }],
      disagreements: [],
      frictions: [{ groupId: "g1", text: "No visible price." }],
    });

    expect(synthesis.topFindings[0]).toMatchObject({
      observation: "2 of 3 personas stalled on the price.",
      affectedPersonaCount: 2,
      totalPersonaCount: 3,
      confidence: "some support",
      groupId: "g1",
    });
    expect(synthesis.topFindings[0].citations?.[0].quote).toBe("I nearly choked at the price.");
    expect(synthesis.topFindings[0].impact).toBe("2 of 3 personas stop before acting.");
    expect(synthesis.biggestFrictions).toEqual(["No visible price."]);
  });

  it("carries the profile facts into the saved synthesis", () => {
    const profile = {
      contentKind: "landing_page" as const,
      facts: [{ kind: "price" as const, label: "Pro price", value: "$99 per run", source: "text" as const }],
      openQuestions: ["Is there an annual plan?"],
      stageAnchorKind: "heading" as const,
      confidence: "high" as const,
      degraded: [],
    };
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger: ledger(), profile });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "Several personas stalled.",
      researchQuestionAnswer: "Price opacity blocks the next step.",
      findings: [],
      disagreements: [],
      frictions: [],
    });

    expect(synthesis.facts).toEqual(profile.facts);
    expect(synthesis.contentKind).toBe("landing_page");
  });

  it("carries rejected claims for the persona card without counting them", () => {
    const rejected = ledger().rejectedClaims;
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger: ledger() });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "Several personas stalled.",
      researchQuestionAnswer: "Price opacity blocks the next step.",
      findings: [{ groupId: "g1", observation: "Price opacity stalls the cohort.", impact: "They stop." }],
      disagreements: [],
      frictions: [],
    });

    expect(rejected).toHaveLength(1);
    expect(synthesis.rejectedClaims).toEqual(rejected);
    expect(synthesis.topFindings[0].affectedPersonaCount).toBe(2);
  });

  it("always adds a No clear view bucket so the split sums to the completed count", () => {
    const plan = buildSynthesisPlan({
      researchQuestion: "q",
      ledger: ledger({
        groups: [
          group({
            personaCount: 3,
            supports: 1,
            opposes: 1,
            neutral: 1,
            claims: [],
          }),
        ],
      }),
    });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "",
      researchQuestionAnswer: "",
      findings: [],
      disagreements: [{ groupId: "g1", supportsLabel: "Worth it", opposesLabel: "Too expensive" }],
      frictions: [],
    });

    const split = synthesis.disagreements[0].split;
    expect(split.reduce((sum, side) => sum + side.personaCount, 0)).toBe(plan.completedCount);
    expect(split.some((side) => side.view === "No clear view")).toBe(true);
    expect(split.find((side) => side.view === "No clear view")?.personaCount).toBe(1);
  });

  it("produces a deterministic finding when the writer omits a group", () => {
    const plan = buildSynthesisPlan({ researchQuestion: "q", ledger: ledger() });
    const synthesis = buildArtifactSynthesis(plan, {
      overview: "",
      researchQuestionAnswer: "",
      findings: [],
      disagreements: [],
      frictions: [],
    });
    expect(synthesis.topFindings).toHaveLength(1);
    expect(synthesis.topFindings[0].observation).toBe("Price opacity");
    expect(synthesis.topFindings[0].affectedPersonaCount).toBe(2);
  });
});
