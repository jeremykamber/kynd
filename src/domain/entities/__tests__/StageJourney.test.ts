import { describe, expect, it } from "vitest";
import type { ArtifactProfile } from "../ArtifactProfile";
import { sanitizeJourneyAnchors, type StageJourney } from "../StageJourney";

const base: ArtifactProfile = {
  contentKind: "video_script",
  facts: [],
  openQuestions: [],
  stageAnchorKind: "timestamp",
  confidence: "high",
  degraded: [],
};

function stage(stageName: StageJourney["stage"], anchor?: StageJourney["anchor"]): StageJourney {
  return { stage: stageName, description: "d", sentiment: "neutral", outcome: "succeeded", ...(anchor ? { anchor } : {}) };
}

describe("sanitizeJourneyAnchors", () => {
  it("keeps rising timestamps and drops a descending one", () => {
    const journey = sanitizeJourneyAnchors(
      [
        stage("interpretation", { kind: "timestamp", value: "0:12" }),
        stage("understanding", { kind: "timestamp", value: "0:40" }),
        stage("belief", { kind: "timestamp", value: "0:20" }),
      ],
      base,
    );

    expect(journey[0].anchor).toEqual({ kind: "timestamp", value: "0:12" });
    expect(journey[1].anchor).toEqual({ kind: "timestamp", value: "0:40" });
    expect(journey[2].anchor).toBeUndefined();
  });

  it("drops an anchor of the wrong kind for a video profile", () => {
    const journey = sanitizeJourneyAnchors(
      [stage("interpretation", { kind: "quote", value: "hello" })],
      base,
    );
    expect(journey[0].anchor).toBeUndefined();
  });

  it("keeps a heading that appears in the text and drops one that does not", () => {
    const textProfile: ArtifactProfile = {
      ...base,
      contentKind: "document",
      stageAnchorKind: "heading",
    };
    const journey = sanitizeJourneyAnchors(
      [
        stage("interpretation", { kind: "heading", value: "Pricing" }),
        stage("understanding", { kind: "heading", value: "Security" }),
      ],
      textProfile,
      "## Pricing\n$99 per run",
    );

    expect(journey[0].anchor).toEqual({ kind: "heading", value: "Pricing" });
    expect(journey[1].anchor).toBeUndefined();
  });

  it("drops a heading or quote when there is no artifact text to verify it", () => {
    const textProfile: ArtifactProfile = { ...base, contentKind: "landing_page", stageAnchorKind: "quote" };
    const journey = sanitizeJourneyAnchors(
      [stage("interpretation", { kind: "quote", value: "The Growth tier is required" })],
      textProfile,
      undefined,
    );
    expect(journey[0].anchor).toBeUndefined();
  });

  it("drops every anchor when the profile allows none", () => {
    const siteProfile: ArtifactProfile = { ...base, contentKind: "landing_page", stageAnchorKind: "none" };
    const journey = sanitizeJourneyAnchors(
      [stage("interpretation", { kind: "quote", value: "Know what your users think" })],
      siteProfile,
    );
    expect(journey[0].anchor).toBeUndefined();
  });
});
