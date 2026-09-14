import { describe, it, expect, vi } from "vitest";
import { InCharacterEvaluator } from "../InCharacterEvaluator";
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
};

describe("InCharacterEvaluator", () => {
  it("builds interview questions for all Big Five dimensions", async () => {
    type ChatMessage = { role: string; content: string };
    const createChatCompletion = vi.fn<
      (messages: ChatMessage[], options: { purpose?: string }) => Promise<string>
    >(async () => "I like trying new tools.");
    // Partial mock of the LLM service: only the completion primitive is used.
    const evaluator = new InCharacterEvaluator({ createChatCompletion } as unknown as LlmServiceImpl);

    await evaluator.runInterview(basePersona);

    // Observe the questions actually posed: each dimension is probed by at
    // least two distinct questions, so dropping a dimension's protocol fails.
    const posed = createChatCompletion.mock.calls.map(([messages, options]) => ({
      dimension: (options.purpose ?? "").replace("InCharacter Interview: ", ""),
      question: messages[1].content,
    }));

    expect(posed.length).toBeGreaterThanOrEqual(10);
    for (const dimension of ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"]) {
      const asked = posed.filter((p) => p.dimension === dimension).map((p) => p.question);
      expect(new Set(asked).size).toBeGreaterThanOrEqual(2);
      for (const question of asked) {
        expect(question.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("conducts an interview and collects responses", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue("I believe in trying new things when they solve real problems."),
    };
    const evaluator = new InCharacterEvaluator(mockLlm as any);
    const transcript = await evaluator.runInterview(basePersona);

    expect(transcript).toContain("Q:");
    expect(transcript).toContain("A:");
    expect(mockLlm.createChatCompletion).toHaveBeenCalled();
  });

  it("parses expert trait scores from text", () => {
    const evaluator = new InCharacterEvaluator({} as any);
    const text = `Openness: 72/100\nConscientiousness: 80/100\nExtraversion: 35/100\nAgreeableness: 60/100\nNeuroticism: 55/100`;
    const scores = evaluator["parseExpertScores"](text);

    expect(scores.openness).toBe(72);
    expect(scores.conscientiousness).toBe(80);
    expect(scores.extraversion).toBe(35);
    expect(scores.agreeableness).toBe(60);
    expect(scores.neuroticism).toBe(55);
  });

});
