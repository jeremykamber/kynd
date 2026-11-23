import { describe, it, expect } from "vitest";
import { journeyContradictions, type PersonaResponse } from "../PersonaResponse";

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

describe("journeyContradictions", () => {
  it("accepts a succeeded stage with a negative mood but no stop", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Disliked the price but understood the plan.", "succeeded", "negative"),
        stage("belief", "Trusted the brand.", "succeeded", "neutral"),
      ]),
    );
    expect(violations).toEqual([]);
  });

  it("flags a succeeded stage whose description says the persona stopped", () => {
    const violations = journeyContradictions(
      response([
        stage("interpretation", "Understood the offer.", "succeeded", "positive"),
        stage("understanding", "Stopped at the price because the cap was hidden.", "succeeded", "negative"),
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
