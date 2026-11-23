import { describe, it, expect } from "vitest";
import {
  journeyContradictions,
  PersonaResponseSchema,
  validatePersonaResponse,
  type PersonaResponse,
} from "../PersonaResponse";
import { COGNITIVE_STAGES } from "../CognitiveStage";

type Stage = PersonaResponse["customerJourney"][number];

function stage(
  name: Stage["stage"],
  description: string,
  outcome: Stage["outcome"],
  sentiment: Stage["sentiment"] = "neutral",
): Stage {
  return { stage: name, description, outcome, sentiment };
}

function response(journey: Stage[]): PersonaResponse {
  return {
    id: "r1",
    rawAnalysis: "I read the brief and looked for the cap.",
    overview: "Sky reviewed the brief and doubted the cap.",
    researchQuestionAnswer: "Sky would approve the brief once the cap is named.",
    customerJourney: journey,
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: { name: "Sky", occupation: "Head of Marketing" } as PersonaResponse["personaProfile"],
  };
}

function schemaResponse(journey: Stage[]) {
  return {
    overview: "Sky reviewed the brief.",
    customerJourney: journey,
    researchQuestionAnswer: "Sky would approve.",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
  };
}

describe("sparse journey validation", () => {
  it("accepts a journey that ends at the stage where the persona stopped", () => {
    const journey = [
      stage("interpretation", "Understood the offer.", "succeeded"),
      stage("understanding", "Stopped at the hidden price.", "stopped"),
    ];

    expect(validatePersonaResponse(response(journey))).toBe(true);
    expect(PersonaResponseSchema.safeParse(schemaResponse(journey)).success).toBe(true);
  });

  it("rejects a sparse journey that ends while still succeeding", () => {
    const journey = [
      stage("interpretation", "Understood the offer.", "succeeded"),
      stage("understanding", "Understood the plan.", "succeeded"),
    ];

    expect(validatePersonaResponse(response(journey))).toBe(false);
  });

  it("rejects empty and over-long journeys", () => {
    const empty: Stage[] = [];
    const six = [
      ...COGNITIVE_STAGES.map((name) => stage(name, `${name} passed.`, "succeeded")),
      stage("interpretation", "Repeated stage.", "succeeded"),
    ];

    expect(PersonaResponseSchema.safeParse(schemaResponse(empty)).success).toBe(false);
    expect(PersonaResponseSchema.safeParse(schemaResponse(six)).success).toBe(false);
    expect(validatePersonaResponse(response(empty))).toBe(false);
    expect(validatePersonaResponse(response(six))).toBe(false);
  });

  it("keeps accepting a stored five-stage journey with later stopped stages", () => {
    const journey = [
      stage("interpretation", "Understood the offer.", "succeeded"),
      stage("understanding", "Could not find the price.", "blocked"),
      stage("belief", "Not reached.", "stopped"),
      stage("motivation", "Not reached.", "stopped"),
      stage("action", "Not reached.", "stopped"),
    ];

    expect(validatePersonaResponse(response(journey))).toBe(true);
  });
});

describe("journeyContradictions", () => {
  it("accepts a succeeded stage with a negative mood but no stop", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Disliked the price but understood the plan.", "succeeded", "negative"),
        stage("belief", "Trusted the brand.", "succeeded", "neutral"),
        stage("motivation", "Wanted to try it.", "succeeded", "positive"),
        stage("action", "Started the trial.", "succeeded", "positive"),
      ]),
    );
    expect(violations).toEqual([]);
  });

  it("flags a sparse journey that ends succeeded", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Understood the plan.", "succeeded", "positive"),
      ]),
    );
    expect(violations).toEqual(["a journey shorter than five stages must end blocked or stopped"]);
  });

  it("flags a succeeded stage whose description says the persona stopped", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Stopped at the price because the cap was hidden.", "succeeded", "negative"),
        stage("belief", "Trusted the brand.", "succeeded", "neutral"),
        stage("motivation", "Wanted to try it.", "succeeded", "positive"),
        stage("action", "Started the trial.", "succeeded", "positive"),
      ]),
    );
    expect(violations).toEqual(['stage "understanding" says it succeeded but describes stopping']);
  });

  it("flags a stage that succeeds after the journey already ended", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Could not find the price.", "blocked", "negative"),
        stage("belief", "Trusted the brand.", "succeeded", "positive"),
      ]),
    );
    expect(violations).toEqual(['stage "belief" follows an ended journey but is "succeeded"']);
  });

  it("accepts later stopped stages after the journey ended", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Could not find the price.", "blocked", "negative"),
        stage("belief", "Not reached. Abandoned at understanding.", "stopped", "negative"),
        stage("motivation", "Not reached. Abandoned at understanding.", "stopped", "negative"),
        stage("action", "Not reached. Abandoned at understanding.", "stopped", "negative"),
      ]),
    );
    expect(violations).toEqual([]);
  });
});
