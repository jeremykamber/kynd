import { describe, expect, it } from "vitest";
import {
  fallbackArtifactProfile,
  guardProfileFacts,
  isAnchorAllowed,
  parseArtifactProfile,
  timestampSeconds,
} from "../ArtifactProfile";

describe("parseArtifactProfile", () => {
  it("keeps a valid video profile with a timestamp anchor and a price", () => {
    const profile = parseArtifactProfile({
      contentKind: "video_script",
      facts: [
        {
          kind: "price",
          label: "Monthly price",
          value: "$99 per month",
          sourceQuote: "$99 per month",
          source: "text",
          amount: 99,
          currency: "USD",
          period: "month",
        },
      ],
      openQuestions: ["What happens after the first month?"],
      stageAnchorKind: "timestamp",
      confidence: "high",
    });

    expect(profile.contentKind).toBe("video_script");
    expect(profile.stageAnchorKind).toBe("timestamp");
    expect(profile.facts).toHaveLength(1);
    expect(profile.facts[0]).toMatchObject({ kind: "price", amount: 99, currency: "USD" });
    expect(profile.degraded).toEqual([]);
  });

  it("drops unknown kinds and records the loss instead of guessing", () => {
    const profile = parseArtifactProfile({
      contentKind: "sales_email",
      facts: [{ kind: "vibes", label: "Feeling", value: "good", source: "text" }],
      openQuestions: [],
      stageAnchorKind: "astrology",
      confidence: "certain",
    });

    expect(profile.contentKind).toBe("other");
    expect(profile.facts).toEqual([]);
    expect(profile.stageAnchorKind).toBe("quote");
    expect(profile.confidence).toBe("low");
    expect(profile.degraded.length).toBeGreaterThan(0);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseArtifactProfile("nope")).toThrow("not an object");
  });
});

describe("guardProfileFacts", () => {
  const base = {
    contentKind: "landing_page" as const,
    facts: [],
    openQuestions: [],
    stageAnchorKind: "none" as const,
    confidence: "high" as const,
    degraded: [],
  };

  it("keeps a text fact whose quote appears verbatim, ignoring case and spacing", () => {
    const profile = guardProfileFacts(
      {
        ...base,
        facts: [
          {
            kind: "price",
            label: "Pro price",
            value: "$99 per run",
            sourceQuote: "  $99 PER RUN ",
            source: "text",
          },
        ],
      },
      { text: "First analysis free. Then $99 per run, no card required.", hasScreenshot: false },
    );

    expect(profile.facts).toHaveLength(1);
    expect(profile.degraded).toEqual([]);
  });

  it("catches a contradicted fact and records why it was removed", () => {
    const profile = guardProfileFacts(
      {
        ...base,
        facts: [
          {
            kind: "price",
            label: "Pro price",
            value: "$49 per run",
            sourceQuote: "$49 per run",
            source: "text",
          },
        ],
      },
      { text: "First analysis free. Then $99 per run, no card required.", hasScreenshot: false },
    );

    expect(profile.facts).toEqual([]);
    expect(profile.degraded.join(" ")).toContain('Fact "Pro price" removed');
  });

  it("drops a fact whose value contradicts its own quote", () => {
    const profile = guardProfileFacts(
      {
        ...base,
        facts: [
          {
            kind: "price",
            label: "Pro price",
            value: "$99 per month",
            sourceQuote: "$49 per month",
            source: "text",
          },
        ],
      },
      { text: "Pro plan: $49 per month, billed annually.", hasScreenshot: false },
    );

    expect(profile.facts).toEqual([]);
    expect(profile.degraded.join(" ")).toContain("value states a number the quote does not");
  });

  it("drops a text fact that has no quote at all", () => {
    const profile = guardProfileFacts(
      { ...base, facts: [{ kind: "claim", label: "Claim", value: "Fast", source: "text" }] },
      { text: "Fast setup.", hasScreenshot: false },
    );

    expect(profile.facts).toEqual([]);
  });

  it("allows a screenshot fact only when the run has a screenshot", () => {
    const fact = {
      kind: "claim" as const,
      label: "Headline",
      value: "Know what your users think",
      sourceQuote: "Know what your users think",
      source: "screenshot" as const,
    };

    expect(guardProfileFacts({ ...base, facts: [fact] }, { hasScreenshot: true }).facts).toHaveLength(1);
    expect(guardProfileFacts({ ...base, facts: [fact] }, { hasScreenshot: false }).facts).toHaveLength(0);
  });
});

describe("stage anchors", () => {
  it("allows a timestamp only for a video profile and checks its shape", () => {
    const video = { ...fallbackArtifactProfile("document"), contentKind: "video_script" as const, stageAnchorKind: "timestamp" as const };
    expect(isAnchorAllowed({ kind: "timestamp", value: "01:42" }, video)).toBe(true);
    expect(isAnchorAllowed({ kind: "timestamp", value: "later" }, video)).toBe(false);
    expect(isAnchorAllowed({ kind: "quote", value: "hello" }, video)).toBe(false);
    expect(timestampSeconds("01:42")).toBe(102);
  });
});
