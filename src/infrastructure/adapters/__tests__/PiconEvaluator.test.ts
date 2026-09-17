import { describe, it, expect, vi } from "vitest";
import { PiconEvaluator } from "../PiconEvaluator";
import type { LlmServiceImpl } from "../LlmServiceImpl";
import type { Persona } from "@/domain/entities/Persona";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas"],
  goals: ["optimize"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  values: ["Efficiency", "Transparency"],
  fears: ["Wasted effort", "Vendor lock-in"],
  communicationStyle: "Direct",
  decisionStyle: "Data-driven",
  backstory: "I grew up in a family of engineers. I once lost $10,000 on a bad contract.",
};

describe("PiconEvaluator", () => {
  it("runs multi-turn interrogation and collects answers", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("I work in product management at a B2B SaaS company."),
    };
    const evaluator = new PiconEvaluator(mockLlm as any);
    const turns = await evaluator.runInterrogation(basePersona);

    expect(turns.length).toBeGreaterThanOrEqual(5);
    expect(turns[0]).toHaveProperty("question");
    expect(turns[0]).toHaveProperty("answer");
    expect(turns[0]).toHaveProperty("turnNumber");
  });

  it("evaluates internal consistency with expert judge", async () => {
    const contradiction = '"I use Slack every day." conflicts with "I prefer email over Slack."';
    const answersByPurpose: Record<string, string> = {
      "PICon Turn 1": "I work in product management.",
      "PICon Turn 2": "I use Slack every day.",
      "PICon Turn 3": "I moved into product from support.",
      "PICon Turn 4": "Hiring is my biggest challenge right now.",
      "PICon Turn 5": "I prefer email over Slack.",
      "PICon Turn 6": "I regret signing a CRM contract.",
      "PICon Turn 7": "I run a pilot before buying.",
      "PICon Turn 8": "I learned to negotiate month-to-month.",
    };
    type ChatMessage = { role: string; content: string };
    const createChatCompletion = vi.fn<
      (messages: ChatMessage[], options: { purpose?: string }) => Promise<string>
    >(async (_messages, options) => {
      switch (options.purpose) {
        case "PICon Internal Consistency":
          return JSON.stringify({
            contradictions_found: 1,
            total_claim_pairs_examined: 10,
            contradiction_rate: 0.1,
            contradictions: [contradiction],
            score: 0.9,
          });
        case "PICon External Consistency":
          return JSON.stringify({ aligned_claims: 5, total_verifiable_claims: 5, misalignments: [], score: 0.9 });
        case "PICon Retest Consistency":
          return JSON.stringify({ consistent_pairs: 3, total_pairs: 3, inconsistencies: [], score: 0.9 });
        default:
          return answersByPurpose[options.purpose ?? ""] ?? "answer";
      }
    });
    // Partial mock of the LLM service: only the completion primitive is used.
    const evaluator = new PiconEvaluator({ createChatCompletion } as unknown as LlmServiceImpl);

    const result = await evaluator.evaluate(basePersona);

    expect(result.internalConsistency).toBe(90);
    // The judge's contradiction content survives verbatim — the two clashing
    // statements, not an empty or mispaired list.
    expect(result.contradictions).toEqual([contradiction]);

    // The judge was shown both conflicting claims from the interrogation.
    const judgeCall = createChatCompletion.mock.calls.find(
      ([, options]) => options.purpose === "PICon Internal Consistency",
    );
    expect(judgeCall?.[0][1].content).toContain("I use Slack every day.");
    expect(judgeCall?.[0][1].content).toContain("I prefer email over Slack.");
  });

});
