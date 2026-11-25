import { describe, it, expect } from "vitest";
import type { Persona } from "@/domain/entities/Persona";
import type { SimulationFrame } from "@/domain/entities/SimulationFrame";
import {
  buildPersonaExtractionSystemPrompt,
  buildVisceralMonologueSystemPrompt,
} from "../VisionAnalysisAdapter";

const persona: Persona = {
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
  decisionRole: "blocker",
  currentAlternative: "a shared spreadsheet",
  switchingTrigger: "a security review they can forward",
};

const frame: SimulationFrame = {
  personaId: "p-1",
  decisionRole: "blocker",
  decisionRoleSource: "persona",
  roleTask: "Judge what would stop you from approving this for your team.",
  entryPoint: "Security, integration, migration, and support.",
  decisionQuestion: "Would you adopt this product in your work?",
  currentAlternative: "a shared spreadsheet",
  switchingTrigger: "a security review they can forward",
};

describe("monologue frame", () => {
  it("gives the persona its role task, entry point, alternative, and trigger", () => {
    const prompt = buildVisceralMonologueSystemPrompt(
      persona,
      "Would you adopt this?",
      { kind: "document", name: "brief" },
      frame,
    );
    expect(prompt).toContain("THIS RUN'S ROLE — blocker");
    expect(prompt).toContain(frame.roleTask);
    expect(prompt).toContain(frame.entryPoint);
    expect(prompt).toContain("a shared spreadsheet");
    expect(prompt).toContain("a security review they can forward");
    expect(prompt).toContain("Do not decide a final verdict");
  });

  it("never shows the persona the verdict set", () => {
    const prompt = buildVisceralMonologueSystemPrompt(persona, "q", undefined, frame);
    expect(prompt).not.toContain("adopt, trial, reject");
    expect(prompt).not.toContain("undecided");
  });
});

describe("extraction frame", () => {
  it("adds the decision question, fixed verdicts, and the identity rule", () => {
    const prompt = buildPersonaExtractionSystemPrompt(
      persona,
      "I would need a security review first.",
      "Would you adopt this?",
      { kind: "document", name: "brief" },
      frame,
      { contentKind: "feature_brief", facts: [], openQuestions: [], stageAnchorKind: "quote", confidence: "high", degraded: [] },
    );
    expect(prompt).toContain("adopt, trial, reject, undecided");
    expect(prompt).toContain("A role never implies a verdict");
    expect(prompt).toContain("Decision question: Would you adopt this product in your work?");
    expect(prompt).toContain("This run's role is blocker");
    expect(prompt).toContain("do not adopt the artifact's assigned role");
    expect(prompt).toContain("Content kind: feature_brief");
  });

  it("states the fallback role when no frame was built", () => {
    const prompt = buildPersonaExtractionSystemPrompt(persona, "text", "q");
    expect(prompt).toContain("This run's role is daily_user");
  });
});
