import { describe, it, expect } from "vitest";
import type { ClaimLedger, ClaimGroup } from "@/domain/entities/PersonaClaim";
import { buildArtifactSynthesis, buildSynthesisPlan } from "../plan";
import { markedFieldCount, validateSynthesis, warningField } from "../validateSynthesis";

const group: ClaimGroup = {
  id: "g1",
  topic: "Price opacity",
  claims: [
    {
      id: "p-1:0",
      personaId: "p-1",
      topic: "Price opacity",
      observation: "The price is hidden.",
      stance: "opposes",
      quote: "I cannot find the price.",
    },
  ],
  personaCount: 2,
  supports: 0,
  opposes: 2,
  neutral: 0,
  citations: [{ personaId: "p-1", personaName: "Sarah Chen", quote: "I cannot find the price." }],
};

const ledger: ClaimLedger = {
  groups: [group],
  verdicts: { adopt: 0, trial: 1, reject: 1, undecided: 1 },
  completedCount: 3,
  failedCount: 0,
  totalPersonaCount: 3,
  missingClaimPersonaIds: [],
  rejectedClaims: [],
  degraded: [],
};

function plan() {
  return buildSynthesisPlan({ researchQuestion: "q", ledger, personaNames: ["Sarah Chen"] });
}

/** Five completed personas, a two-persona group: 2/5 = 40%. */
function widePlan() {
  return buildSynthesisPlan({
    researchQuestion: "q",
    ledger: { ...ledger, completedCount: 5, totalPersonaCount: 5, failedCount: 0, verdicts: { adopt: 0, trial: 3, reject: 1, undecided: 1 } },
    personaNames: ["Sarah Chen"],
  });
}

function draft(overrides: Partial<Parameters<typeof buildArtifactSynthesis>[1]> = {}) {
  return {
    overview: "Several personas stopped.",
    researchQuestionAnswer: "Price opacity blocks action.",
    findings: [{ groupId: "g1", observation: "Price opacity stalls the cohort.", impact: "They stop." }],
    disagreements: [],
    frictions: [],
    ...overrides,
  };
}

describe("validateSynthesis", () => {
  it("accepts a report built from the ledger", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(p, draft());
    expect(validateSynthesis(p, synthesis)).toEqual([]);
  });

  it("rejects an invented number in the overview", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "All 47 personas stopped." }));
    const violations = validateSynthesis(p, synthesis);
    expect(violations.some((v) => v.field === "overview" && v.message.includes("47"))).toBe(true);
  });

  it('rejects "100 personas" when the cohort is smaller than 100', () => {
    const p = widePlan();
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "100 personas stopped." }));
    const violations = validateSynthesis(p, synthesis);
    expect(violations.some((v) => v.field === "overview" && v.message.includes("100"))).toBe(true);
  });

  it('rejects "40 personas" even though 40% is a derived percentage', () => {
    const p = widePlan();
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "40 personas stopped." }));
    const violations = validateSynthesis(p, synthesis);
    expect(violations.some((v) => v.field === "overview" && v.message.includes("40"))).toBe(true);
  });

  it('accepts a derived percentage only with a % suffix', () => {
    const p = widePlan();
    const accepted = buildArtifactSynthesis(p, draft({ overview: "40% of personas stopped." }));
    expect(validateSynthesis(p, accepted)).toEqual([]);

    const wrong = buildArtifactSynthesis(
      p,
      draft({ findings: [{ groupId: "g1", observation: "100% of personas stalled.", impact: "They stop." }] }),
    );
    expect(validateSynthesis(p, wrong).some((v) => v.field.startsWith("finding:g1") && v.message.includes("100%"))).toBe(true);
  });

  it('rejects 100% in the overview for a partial group', () => {
    const p = widePlan();
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "100% of personas stopped." }));
    expect(validateSynthesis(p, synthesis).some((v) => v.field === "overview" && v.message.includes("100%"))).toBe(true);
  });

  it('lets the writer quote a 100 the artifact states', () => {
    const p = buildSynthesisPlan({
      researchQuestion: "q",
      ledger,
      personaNames: ["Sarah Chen"],
      profile: {
        contentKind: "document",
        facts: [{ kind: "claim", label: "Templates", value: "100 templates", source: "text" }],
        openQuestions: [],
        stageAnchorKind: "quote",
        confidence: "high",
        degraded: [],
      },
    });
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "The document offers 100 templates." }));
    expect(validateSynthesis(p, synthesis)).toEqual([]);
  });

  it('allows 100% only when the group covers every completed persona', () => {
    const p = buildSynthesisPlan({
      researchQuestion: "q",
      ledger: {
        ...ledger,
        completedCount: 5,
        totalPersonaCount: 5,
        failedCount: 0,
        verdicts: { adopt: 0, trial: 3, reject: 1, undecided: 1 },
        groups: [{ ...group, personaCount: 5, opposes: 5 }],
      },
      personaNames: ["Sarah Chen"],
    });
    const synthesis = buildArtifactSynthesis(p, draft({ overview: "100% of personas stopped on price." }));
    expect(validateSynthesis(p, synthesis).some((v) => v.field === "overview" && v.message.includes("100%"))).toBe(false);
  });

  it('rejects "all" when the group does not cover every completed persona', () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(
      p,
      draft({
        findings: [{ groupId: "g1", observation: "All personas stalled on price.", impact: "They stop." }],
      }),
    );
    const violations = validateSynthesis(p, synthesis);
    expect(violations.some((v) => v.field.startsWith("finding:g1") && v.message.includes('"all"'))).toBe(true);
  });

  it("rejects a recommendation", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(
      p,
      draft({ overview: "You should lower the price." }),
    );
    expect(validateSynthesis(p, synthesis).some((v) => v.field === "overview")).toBe(true);
  });

  it("rejects a persona name in aggregate prose", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(
      p,
      draft({ overview: "Sarah Chen stopped at the price." }),
    );
    expect(validateSynthesis(p, synthesis).some((v) => v.message.includes("Sarah Chen"))).toBe(true);
  });

  it("rejects a split that does not sum to the completed count", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(p, draft());
    synthesis.disagreements = [
      {
        topic: "Price",
        split: [
          { view: "Supports", personaCount: 1 },
          { view: "Opposes", personaCount: 1 },
          { view: "No clear view", personaCount: 0 },
        ],
        significance: "Low",
        groupId: "g1",
      },
    ];
    expect(validateSynthesis(p, synthesis).some((v) => v.field.startsWith("split:"))).toBe(true);
  });

  it("rejects a citation the ledger does not hold", () => {
    const p = plan();
    const synthesis = buildArtifactSynthesis(p, draft());
    synthesis.topFindings[0].citations = [
      { personaId: "p-1", personaName: "Sarah Chen", quote: "A quote nobody said." },
    ];
    expect(validateSynthesis(p, synthesis).some((v) => v.field.startsWith("finding:"))).toBe(true);
  });
});

describe("markedFieldCount", () => {
  it("counts one marked field per run and distinguishes fields inside one group", () => {
    expect(markedFieldCount(["overview: a", "overview: b"])).toBe(1);
    // One finding is one marked field, even when its two sentences failed.
    expect(markedFieldCount(["finding:g1:observation: a", "finding:g1:impact: b"])).toBe(1);
    expect(markedFieldCount(["finding:g1:impact: a", "finding:g2:impact: b"])).toBe(2);
    expect(markedFieldCount(["split:g1: a", "split:g2: b"])).toBe(2);
    expect(markedFieldCount(["friction:0: a", "friction:1: b"])).toBe(2);
    expect(markedFieldCount([])).toBe(0);
  });

  it("extracts the field tag from a warning", () => {
    expect(warningField("finding:g1:impact: states the number 9")).toBe("finding:g1:impact");
  });
});
