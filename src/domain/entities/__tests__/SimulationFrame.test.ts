import { describe, it, expect } from "vitest";
import type { Persona } from "@/domain/entities/Persona";
import type { ArtifactProfile } from "@/domain/entities/ArtifactProfile";
import { buildSimulationFrames, provisionalProfile } from "../SimulationFrame";

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "p-1",
    name: "Maya Ortiz",
    age: 34,
    occupation: "Head of Product",
    educationLevel: "MBA",
    interests: [],
    goals: ["validate ideas"],
    conscientiousness: 70,
    neuroticism: 40,
    openness: 70,
    extraversion: 50,
    agreeableness: 50,
    values: ["evidence"],
    fears: ["wasted budget"],
    communicationStyle: "direct",
    decisionStyle: "data-driven",
    ...overrides,
  };
}

const profile: ArtifactProfile = {
  contentKind: "landing_page",
  facts: [],
  openQuestions: [],
  stageAnchorKind: "none",
  confidence: "medium",
  degraded: [],
};

describe("buildSimulationFrames", () => {
  it("uses the persona's declared role and its task and entry point", () => {
    const [frame] = buildSimulationFrames([persona({ decisionRole: "blocker" })], profile);
    expect(frame).toMatchObject({
      personaId: "p-1",
      decisionRole: "blocker",
      decisionRoleSource: "persona",
      decisionQuestion: "Would you take the next step this page asks for?",
    });
    expect(frame.roleTask).toContain("approving this for your team");
    expect(frame.entryPoint).toContain("Security");
  });

  it("falls back to daily_user and says the role was inferred", () => {
    const [frame] = buildSimulationFrames([persona()], profile);
    expect(frame.decisionRole).toBe("daily_user");
    expect(frame.decisionRoleSource).toBe("fallback");
  });

  it("produces the same frame on every run for the same persona and artifact", () => {
    const input = persona({ decisionRole: "champion", currentAlternative: "a shared doc" });
    expect(buildSimulationFrames([input], profile)).toEqual(buildSimulationFrames([input], profile));
  });

  it("chooses the decision question from the artifact content kind", () => {
    const [frame] = buildSimulationFrames(
      [persona()],
      { ...profile, contentKind: "video_script" },
    );
    expect(frame.decisionQuestion).toBe("Would you keep watching and act on it?");
  });

  it("does not invent an alternative or trigger", () => {
    const [frame] = buildSimulationFrames([persona()], profile);
    expect(frame.currentAlternative).toBeUndefined();
    expect(frame.switchingTrigger).toBeUndefined();
  });
});

describe("provisionalProfile", () => {
  it("reads a text artifact as a document and a site as a landing page", () => {
    expect(provisionalProfile({ text: "words" }).contentKind).toBe("document");
    expect(provisionalProfile({}).contentKind).toBe("landing_page");
  });
});
