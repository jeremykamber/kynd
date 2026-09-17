import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { collectStream } from "../../__tests__/test-utils";

const mockChatWithPanelStream = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/adapters/LlmServiceImpl", () => ({
  LlmServiceImpl: {
    createFromEnv: vi.fn(() => ({
      chatWithPanelStream: mockChatWithPanelStream,
    })),
  },
}));

function buildResponse() {
  return {
    id: "r-1",
    screenshotBase64: "iVBOR...",
    rawAnalysis: "raw stream",
    overview: "Sarah found the pricing clear.",
    customerJourney: [
      { stage: "interpretation", description: "d", sentiment: "neutral", outcome: "succeeded" },
      { stage: "understanding", description: "d", sentiment: "positive", outcome: "succeeded" },
      { stage: "belief", description: "d", sentiment: "neutral", outcome: "succeeded" },
      { stage: "motivation", description: "d", sentiment: "positive", outcome: "succeeded" },
      { stage: "action", description: "d", sentiment: "negative", outcome: "blocked" },
    ],
    researchQuestionAnswer: "Pricing visibility is the blocker.",
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    personaProfile: {
      name: "Sarah Chen",
      occupation: "Senior Engineer",
      bigFive: { conscientiousness: 80, neuroticism: 30, openness: 70, extraversion: 50, agreeableness: 60 },
      values: ["Transparency"],
      fears: ["Hidden costs"],
      communicationStyle: "direct",
      decisionStyle: "data-driven",
    },
  };
}

describe("POST /api/vps/chat-with-panel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("streams a panel synthesis response", async () => {
    mockChatWithPanelStream.mockImplementation(async function* () {
      yield "A monthly plan would remove the blocker for most of your personas.";
    });

    const { POST } = await import("../route");
    const req = new NextRequest(
      "http://localhost:3000/api/vps/chat-with-panel",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responses: [buildResponse()],
          synthesis: null,
          message: "We're thinking of adding a monthly plan — what would you all think?",
          history: [],
        }),
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const text = await collectStream(res.body!);
    expect(text).toBe("A monthly plan would remove the blocker for most of your personas.");
    expect(mockChatWithPanelStream).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "r-1" })],
      null,
      "We're thinking of adding a monthly plan — what would you all think?",
      [],
    );
  });

  it("defaults missing responses and synthesis to empty/null", async () => {
    // The real stream reads the panel responses and synthesis to build its
    // prompt, so omitting them must arrive as an empty panel and no synthesis;
    // anything else would throw and surface as an ERROR frame to the caller.
    mockChatWithPanelStream.mockImplementation(async function* (
      responses: unknown,
      synthesis: unknown,
    ) {
      if (!Array.isArray(responses)) {
        throw new TypeError("responses is not iterable");
      }
      if (responses.length > 0) throw new Error("expected an empty panel");
      if (synthesis) throw new Error("expected no synthesis");
      yield "Panel reply with no personas or synthesis.";
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost:3000/api/vps/chat-with-panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", history: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");

    const text = await collectStream(res.body!);
    expect(text).toBe("Panel reply with no personas or synthesis.");
  });
});
