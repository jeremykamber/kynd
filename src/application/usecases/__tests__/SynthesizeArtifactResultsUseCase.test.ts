import { describe, it, expect, vi } from "vitest";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import type { ClaimLedger, ClaimGroup } from "@/domain/entities/PersonaClaim";
import type { SynthesisDraft } from "@/domain/entities/SynthesisPlan";
import { buildSynthesisPlan } from "@/application/synthesis/plan";
import { SynthesizeArtifactResultsUseCase } from "../SynthesizeArtifactResultsUseCase";

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

const plan = buildSynthesisPlan({ researchQuestion: "q", ledger, personaNames: ["Sarah Chen"] });

const goodDraft: SynthesisDraft = {
  overview: "Several personas stopped.",
  researchQuestionAnswer: "Price opacity blocks action.",
  findings: [{ groupId: "g1", observation: "Price opacity stalls the cohort.", impact: "They stop." }],
  disagreements: [],
  frictions: [],
};

function port(overrides: Partial<LlmServicePort> = {}): LlmServicePort {
  return {
    synthesizeFromPlan: vi.fn().mockResolvedValue(goodDraft),
    repairSynthesis: vi.fn(),
    ...overrides,
  } as unknown as LlmServicePort;
}

describe("SynthesizeArtifactResultsUseCase", () => {
  it("sends the writer a plan with no raw transcript", async () => {
    const p = port();
    await new SynthesizeArtifactResultsUseCase(p).execute(plan);

    const writerPlan = vi.mocked(p.synthesizeFromPlan).mock.calls[0][0];
    const serialized = JSON.stringify(writerPlan);
    expect(serialized).not.toContain("rawAnalysis");
    expect(serialized).not.toContain("transcript");
    expect(writerPlan.ledger.rejectedClaims).toEqual([]);
    expect(writerPlan.personaNames).toBeUndefined();
  });

  it("fills counts and citations from the ledger", async () => {
    const synthesis = await new SynthesizeArtifactResultsUseCase(port()).execute(plan);
    expect(synthesis.topFindings[0].affectedPersonaCount).toBe(2);
    expect(synthesis.topFindings[0].totalPersonaCount).toBe(3);
    expect(synthesis.topFindings[0].citations?.[0].quote).toBe("I cannot find the price.");
    expect(synthesis.completedCount).toBe(3);
    expect(synthesis.verdicts).toEqual(ledger.verdicts);
  });

  it("repairs once and keeps the repaired draft when it passes", async () => {
    const repair = vi.fn().mockResolvedValue(goodDraft);
    const synthesis = await new SynthesizeArtifactResultsUseCase(
      port({
        synthesizeFromPlan: vi.fn().mockResolvedValue({ ...goodDraft, overview: "All 47 personas stopped." }),
        repairSynthesis: repair,
      }),
    ).execute(plan);

    expect(repair).toHaveBeenCalledTimes(1);
    const violations = vi.mocked(repair).mock.calls[0][2];
    expect(violations.join(" ")).toContain("47");
    expect(synthesis.validationWarnings).toBeUndefined();
  });

  it("keeps the draft and records warnings when the repair still fails", async () => {
    const bad: SynthesisDraft = { ...goodDraft, overview: "All 47 personas stopped." };
    const synthesis = await new SynthesizeArtifactResultsUseCase(
      port({
        synthesizeFromPlan: vi.fn().mockResolvedValue(bad),
        repairSynthesis: vi.fn().mockResolvedValue(bad),
      }),
    ).execute(plan);

    expect(synthesis.validationWarnings?.length).toBeGreaterThan(0);
    expect(synthesis.validationWarnings?.join(" ")).toContain("47");
    // The rest of the report still carries code-owned data.
    expect(synthesis.topFindings[0].affectedPersonaCount).toBe(2);
  });

  it("propagates writer failure to the caller", async () => {
    await expect(
      new SynthesizeArtifactResultsUseCase(
        port({ synthesizeFromPlan: vi.fn().mockRejectedValue(new Error("LLM down")) }),
      ).execute(plan),
    ).rejects.toThrow("LLM down");
  });
});
