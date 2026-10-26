import { describe, it, expect } from "vitest";
import { composeResearchQuestionAnswer, restatePersonaQuantifiers } from "../claims";

describe("restatePersonaQuantifiers", () => {
  it("replaces an unbacked universal with the derived count", () => {
    expect(restatePersonaQuantifiers("All three flagged the cap.", 1, 3)).toBe(
      "1 of 3 personas flagged the cap.",
    );
  });

  it("replaces every/most/nearly everyone variants", () => {
    const cases = [
      "Every persona hit the cap.",
      "Most personas hit the cap.",
      "Nearly everyone hit the cap.",
      "Everyone hit the cap.",
      "The whole cohort hit the cap.",
    ];
    for (const text of cases) {
      expect(restatePersonaQuantifiers(text, 2, 5)).toBe("2 of 5 personas hit the cap.");
    }
  });

  it("keeps a claim that is already exact", () => {
    const text = "2 of 5 personas flagged the cap.";
    expect(restatePersonaQuantifiers(text, 2, 5)).toBe(text);
  });

  it("does not touch quantifiers that are not about personas", () => {
    const text = "All the pricing copy sits below the fold and most of the page is empty.";
    expect(restatePersonaQuantifiers(text, 1, 4)).toBe(text);
  });
});

describe("composeResearchQuestionAnswer", () => {
  it("quotes each persona's own answer verbatim with the run's tally", () => {
    const out = composeResearchQuestionAnswer(
      [
        { personaName: "Kai", answer: "Kai would take a second meeting." },
        { personaName: "Rowan", answer: "Rowan would not commit yet." },
      ],
      "Would you take a second meeting?",
    );
    expect(out).toContain("2 of 2 personas answered");
    expect(out).toContain("Kai: Kai would take a second meeting.");
    expect(out).toContain("Rowan: Rowan would not commit yet.");
    expect(out).toContain("Would you take a second meeting?");
  });

  it("is empty for an empty cohort", () => {
    expect(composeResearchQuestionAnswer([], "q")).toBe("");
  });
});

describe("restatePersonaQuantifiers — agreement", () => {
  it("does not duplicate 'personas' when the phrase already had it", () => {
    expect(restatePersonaQuantifiers("All three personas flagged the cap.", 3, 3)).toBe(
      "3 of 3 personas flagged the cap.",
    );
  });
});
