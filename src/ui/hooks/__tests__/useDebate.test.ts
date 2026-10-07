import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";
import { createStreamableValue } from "../../__tests__/streamableValueTestUtils";

// Mock the server action at module level
vi.mock("@/actions/debateAction", () => ({
  debateAction: vi.fn(),
}));

import { useDebate } from "../useDebate";
import { debateAction } from "@/actions/debateAction";

const mockPersona: Persona = {
  id: "p1", name: "Alice Chen", age: 38,
  occupation: "CTO", educationLevel: "MSc",
  interests: ["cloud"], goals: ["scale"],
  conscientiousness: 80, neuroticism: 60, openness: 60,
  extraversion: 40, agreeableness: 30,
  values: ["security"], fears: ["breach"],
  communicationStyle: "direct", decisionStyle: "data-driven",
  pricingSensitivity: 60, typicalBudget: "$100/mo",
};

/**
 * Runs `startDebate` against a genuine AI-SDK streamable value. The action mock
 * captures `stream.value` the moment it is called (as the real server action
 * does), then the events are pushed through the stream's `update`/`done`.
 */
async function runDebate(events: DebateStreamEvent[]) {
  const stream = createStreamableValue<DebateStreamEvent>();
  vi.mocked(debateAction).mockImplementation(async () => ({
    streamData: stream.value,
  }));

  const { result } = renderHook(() => useDebate());

  let finished!: Promise<string>;
  await act(async () => {
    finished = result.current.startDebate("Test proposal", [mockPersona], 1);
    for (const event of events) stream.update(event);
    stream.done();
  });
  await act(async () => {
    await finished;
  });

  return useDebateStore.getState();
}

describe("useDebate", () => {
  beforeEach(() => {
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
    vi.clearAllMocks();
  });

  it("folds events read through the AI-SDK stream protocol into the store", async () => {
    const state = await runDebate([
      { type: "debate_start", proposal: "Test", participants: ["Alice"] },
      { type: "round_start", round: 1, totalRounds: 1 },
      { type: "persona_start", personaId: "p1", personaName: "Alice Chen" },
      { type: "chunk", personaId: "p1", text: "Hello " },
      { type: "chunk", personaId: "p1", text: "world" },
      { type: "persona_end", personaId: "p1" },
      { type: "round_end", round: 1 },
      { type: "debate_end" },
    ]);

    expect(state.debates).toHaveLength(1);
    expect(state.debates[0].proposal).toBe("Test proposal");
    expect(state.debates[0].status).toBe("completed");
    expect(state.debates[0].currentRound).toBe(1);
    expect(state.debates[0].messages).toHaveLength(1);
    expect(state.debates[0].messages[0].content).toBe("Hello world");
    expect(state.isStreaming).toBe(false);
  });

  it("marks debate as error when stream returns error event", async () => {
    const state = await runDebate([
      { type: "debate_start", proposal: "Test", participants: ["Alice"] },
      { type: "error", message: "LLM failed" },
    ]);

    expect(state.debates[0].status).toBe("error");
    expect(state.debates[0].error).toBe("LLM failed");
  });
});
