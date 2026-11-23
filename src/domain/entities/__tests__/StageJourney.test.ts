import { describe, it, expect } from "vitest";
import { COGNITIVE_STAGES } from "../CognitiveStage";
import { completeJourney, type StageJourney } from "../StageJourney";

function stage(
  name: StageJourney["stage"],
  outcome: StageJourney["outcome"],
  description = `${name} description`,
): StageJourney {
  return { stage: name, description, sentiment: "neutral", outcome };
}

describe("completeJourney", () => {
  it("projects a sparse journey to five stages and marks the tail not reached", () => {
    const reached = [
      stage("interpretation", "succeeded"),
      stage("understanding", "blocked"),
    ];

    const journey = completeJourney(reached);

    expect(journey.map((s) => s.stage)).toEqual([...COGNITIVE_STAGES]);
    expect(journey.slice(0, 2)).toEqual(reached);
    for (const tail of journey.slice(2)) {
      expect(tail.outcome).toBe("stopped");
      expect(tail.sentiment).toBe("neutral");
      expect(tail.description).toBe("Not reached. Abandoned at understanding.");
    }
  });

  it("projects a journey that stops at the first stage", () => {
    const journey = completeJourney([stage("interpretation", "stopped")]);

    expect(journey).toHaveLength(COGNITIVE_STAGES.length);
    expect(journey[1].description).toBe("Not reached. Abandoned at interpretation.");
    expect(journey.every((s, i) => i === 0 || s.outcome === "stopped")).toBe(true);
  });

  it("leaves a complete journey unchanged", () => {
    const complete = COGNITIVE_STAGES.map((name) => stage(name, "succeeded"));

    expect(completeJourney(complete)).toEqual(complete);
  });
});
