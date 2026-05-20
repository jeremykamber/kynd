import { describe, it, expect, vi } from "vitest";
import { PbjScaffoldEnhancer } from "../PbjScaffoldEnhancer";
import type { Persona } from "@/domain/entities/Persona";

const basePersona: Persona = {
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas tools", "hiking"],
  goals: ["optimize team velocity", "reduce churn"],
  personalityTraits: ["analytical", "skeptical"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  cognitiveReflex: 75,
  technicalFluency: 65,
  economicSensitivity: 50,
  designStyle: "Minimalist",
  livingEnvironment: "Clean apartment with home office",
  backstory: "I grew up in a family of engineers.",
};

describe("PbjScaffoldEnhancer", () => {
  it("generates rationales for each scaffold in parallel", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        "High conscientiousness stems from early exposure to structured environments."
      ),
    };
    const enhancer = new PbjScaffoldEnhancer(mockLlm as any);
    const rationales = await enhancer.generateAllRationales(basePersona);

    expect(rationales.length).toBeGreaterThanOrEqual(1);
    expect(rationales[0].scaffold).toBeTruthy();
    expect(rationales[0].rationale).toBeTruthy();
  });

  it("formats rationales into a backstory appendix", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockResolvedValue(
        "This persona makes decisions analytically due to their high cognitive reflex."
      ),
    };
    const enhancer = new PbjScaffoldEnhancer(mockLlm as any);
    const text = await enhancer.enhanceBackstory(basePersona);

    expect(text).toContain("<<PSYCHOLOGICAL RATIONALES (PB&J)>>");
    expect(text).toContain("[Big Five Personality Roots]");
  });

  it("handles LLM failures gracefully (partial results)", async () => {
    const mockLlm = {
      createChatCompletion: vi
        .fn()
        .mockRejectedValueOnce(new Error("LLM error"))
        .mockResolvedValueOnce("Stable output")
        .mockResolvedValueOnce("Stable output"),
    };
    const enhancer = new PbjScaffoldEnhancer(mockLlm as any);
    const rationales = await enhancer.generateAllRationales(basePersona);

    // Should still get results from successful scaffolds
    expect(rationales.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty string when no rationales generated", async () => {
    const mockLlm = {
      createChatCompletion: vi.fn().mockRejectedValue(new Error("LLM error")),
    };
    const enhancer = new PbjScaffoldEnhancer(mockLlm as any);
    const text = await enhancer.enhanceBackstory(basePersona);
    expect(text).toBe("");
  });
});
