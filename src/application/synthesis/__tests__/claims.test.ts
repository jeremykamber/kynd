import { describe, it, expect } from "vitest";
import { composeResearchQuestionAnswer } from "../claims";

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
