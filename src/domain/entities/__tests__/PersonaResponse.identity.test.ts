import { describe, it, expect } from "vitest";
import { personaIdentityViolations, type PersonaResponse } from "../PersonaResponse";

/** Real drift observed in text-artifact runs: run 08 ("freelancer" for a Head
 * of Marketing), run 06 (2 of 8 summaries said "The user…"), run 09 (summary
 * spoke as the persona). The predicate is the mechanical half of the fix; the
 * prompt rule is the other half. */
function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: "r1",
    rawAnalysis: "…transcript…",
    overview: "Sky reviewed the brief and doubted the cap.",
    researchQuestionAnswer: "Sky would approve the brief once the cap is named.",
    customerJourney: [],
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: { name: "Sky", occupation: "Head of Marketing" } as any,
    ...overrides,
  };
}

describe("personaIdentityViolations", () => {
  it("accepts a summary that names the persona", () => {
    expect(personaIdentityViolations(response())).toEqual([]);
  });

  it("flags a summary that calls the persona 'the user'", () => {
    const violations = personaIdentityViolations(
      response({ overview: "The user reviewed feature-brief.docx and moved on." }),
    );
    expect(violations.join(" | ")).toMatch(/the user/);
  });

  it("flags a summary that never names the persona", () => {
    const violations = personaIdentityViolations(
      response({
        overview: "Reviewed the brief and doubted the cap.",
        researchQuestionAnswer: "Would approve once the cap is named.",
      }),
    );
    expect(violations.join(" | ")).toMatch(/does not name the persona \(Sky\)/);
  });

  it("flags a summary written in the first person", () => {
    const violations = personaIdentityViolations(
      response({ researchQuestionAnswer: "I would approve it once the cap is named, said Sky." }),
    );
    expect(violations.join(" | ")).toMatch(/first person/);
  });

  it("falls back to the caller's persona name when the profile is absent", () => {
    const violations = personaIdentityViolations(
      response({
        personaProfile: undefined,
        overview: "Reviewed the brief.",
        researchQuestionAnswer: "Would approve.",
      }),
      "Ada",
    );
    expect(violations.join(" | ")).toMatch(/does not name the persona \(Ada\)/);
  });
});
