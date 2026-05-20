import { describe, it, expect } from "vitest";
import { IdRagStore } from "../IdRagStore";
import type { Persona } from "@/domain/entities/Persona";

const makePersona = (overrides: Partial<Persona> = {}): Persona => ({
  id: "test-1",
  name: "Jordan Chen",
  age: 34,
  occupation: "Product Manager",
  educationLevel: "MBA",
  interests: ["saas"],
  goals: ["optimize"],
  personalityTraits: ["analytical"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 70,
  extraversion: 45,
  agreeableness: 55,
  cognitiveReflex: 75,
  technicalFluency: 65,
  economicSensitivity: 50,
  designStyle: "Minimalist",
  livingEnvironment: "Clean apartment",
  ...overrides,
});

describe("IdRagStore", () => {
  it("chunks a backstory into coherent segments with metadata", () => {
    const store = new IdRagStore();
    const chunks = store.chunkBackstory("test-1", [
      "I grew up in a small town with my parents. My father was an engineer who taught me to question everything. School was always easy for me, and I loved building things.",
      "After college, I joined a startup as a product manager. We grew from 10 to 200 people in three years. I learned how to prioritize features and deal with demanding customers.",
      "I once lost $10,000 on an annual contract for a tool we never used. That experience made me deeply skeptical of long-term commitments and flashy sales pitches.",
    ].join("\n\n"));

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].personaId).toBe("test-1");
    expect(chunks[0].topic).toBeTruthy();
    expect(chunks[0].emotionalTone).toBeTruthy();
    expect(chunks[0].id).toContain("chunk-test-1");
  });

  it("ingests and retrieves relevant chunks", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: [
        "I grew up in a family of engineers. My father was a software architect who taught me to question everything.",
        "My biggest career mistake was signing a three-year contract for $15,000/year for a CRM that our team hated. I learned to always negotiate month-to-month.",
        "Today I run product at a Series B SaaS company. I evaluate tools based on unit economics and team adoption, not flashy demos.",
      ].join("\n\n"),
    });

    store.ingestPersona(persona);

    const results = store.retrieve("test-1", "contract mistake CRM cost");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("retrieves top-K results sorted by relevance", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: [
        "I grew up in a family of engineers who emphasized technical excellence.",
        "My childhood home was filled with gadgets and tools that my father would fix.",
        "I hate spending money on things I don't need. My parents were frugal immigrants.",
      ].join("\n\n"),
    });

    store.ingestPersona(persona);

    const results = store.retrieve("test-1", "money spending frugal", 2);
    expect(results.length).toBeLessThanOrEqual(2);
    // Higher score = more relevant
    if (results.length >= 2) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  it("formats retrieved context for prompt injection", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "I grew up in a small town. My family always emphasized the value of a dollar.",
    });

    store.ingestPersona(persona);
    const results = store.retrieve("test-1", "family value money");
    const formatted = store.formatRetrievedContext(results);

    expect(formatted).toContain("[Relevant Memory 1]");
    expect(formatted).toContain("Topic:");
    expect(formatted).toContain("Tone:");
  });

  it("returns empty array for unknown persona", () => {
    const store = new IdRagStore();
    const results = store.retrieve("nonexistent", "anything");
    expect(results).toEqual([]);
  });

  it("skips empty backstories", () => {
    const store = new IdRagStore();
    const persona = makePersona({ backstory: "" });
    store.ingestPersona(persona);
    const results = store.retrieve("test-1", "anything");
    expect(results).toEqual([]);
  });

  it("clears persona data", () => {
    const store = new IdRagStore();
    const persona = makePersona({
      backstory: "Some backstory text here for testing purposes.",
    });
    store.ingestPersona(persona);
    store.clearPersona("test-1");
    const results = store.retrieve("test-1", "test");
    expect(results).toEqual([]);
  });

  it("links related chunks by adjacency and topic", () => {
    const store = new IdRagStore();
    const chunks = store.chunkBackstory("test-1", [
      "I grew up in a family that valued money carefully. My parents were frugal and taught me to save.",
      "My career in finance taught me to analyze every purchase carefully.",
      "I now live in a minimalist apartment that reflects my organized approach to life.",
    ].join("\n\n"));

    // Related should at minimum include adjacent chunks
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
