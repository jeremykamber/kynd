import { describe, expect, it } from "vitest";
import { isCompletedPersonaResponse, type PersonaResponse } from "../PersonaResponse";

function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: "r1",
    rawAnalysis: "transcript",
    overview: "Ada read the page.",
    researchQuestionAnswer: "Ada would try it.",
    customerJourney: [{ stage: "interpretation", description: "read", sentiment: "neutral", outcome: "succeeded" }],
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    ...overrides,
  };
}

describe("isCompletedPersonaResponse", () => {
  it("accepts a real response", () => {
    expect(isCompletedPersonaResponse(response())).toBe(true);
  });

  it("rejects the degraded fallback a failed persona writes", () => {
    expect(isCompletedPersonaResponse(response({ overview: "Analysis could not be completed." }))).toBe(false);
  });

  it("rejects an empty overview or an empty journey", () => {
    expect(isCompletedPersonaResponse(response({ overview: "" }))).toBe(false);
    expect(isCompletedPersonaResponse(response({ customerJourney: [] }))).toBe(false);
  });
});
