import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// The ICP flow (usePersonaFlow) must always generate strategy-mode personas.
const mockGeneratePersonasAction = vi.hoisted(() => vi.fn());

vi.mock("@/actions/generatePersonas", () => ({
  generatePersonasAction: mockGeneratePersonasAction,
}));
vi.mock("@/actions/getPersonaGenerationResult", () => ({
  getPersonaGenerationResultAction: vi.fn(),
}));
vi.mock("@/actions/getProgress", () => ({
  getProgressAction: vi.fn(),
}));
vi.mock("@/actions/generateBatchTitleAction", () => ({
  generateBatchTitleAction: vi.fn(async () => ({ title: null })),
}));
vi.mock("@ai-sdk/rsc", () => ({
  readStreamableValue: (v: unknown) => v,
}));

import { usePersonaFlow } from "../usePersonaFlow";
import { usePersonaStore } from "@/ui/stores/personaStore";
import { batchConsumedRunIds } from "@/lib/generationRunState";
import type { Persona } from "@/domain/entities/Persona";

const strategyPersona: Persona = {
  id: "p1",
  name: "Alice Chen",
  age: 38,
  occupation: "CTO",
  educationLevel: "MSc",
  interests: ["cloud"],
  goals: ["scale"],
  conscientiousness: 80,
  neuroticism: 60,
  openness: 60,
  extraversion: 40,
  agreeableness: 30,
  values: ["security"],
  fears: ["breach"],
  communicationStyle: "direct",
  decisionStyle: "data-driven",
  pricingSensitivity: 60,
  typicalBudget: "$100/mo",
  generationMode: "strategy",
};

describe("usePersonaFlow (ICP screen)", () => {
  beforeEach(() => {
    mockGeneratePersonasAction.mockReset();
    batchConsumedRunIds.clear();
    usePersonaStore.setState({
      batches: [],
      activeBatchId: null,
      activeGenerationRunIds: [],
    });
  });

  it("generates personas in strategy mode", async () => {
    mockGeneratePersonasAction.mockResolvedValue({
      runId: "run-1",
      streamData: (async function* () {
        yield { step: "GENERATING_BACKSTORIES", completedCount: 0, totalCount: 1 };
        yield { step: "DONE", personas: [strategyPersona] };
      })(),
    });

    const { result } = renderHook(() => usePersonaFlow());

    // setCustomerProfile triggers a re-render; handleGeneratePersonas is a
    // useCallback that closes over customerProfile, so grab it after the update.
    await act(async () => {
      result.current.setCustomerProfile("B2B SaaS founders");
    });

    await act(async () => {
      result.current.handleGeneratePersonas();
    });

    // The strategy-mode request is what makes the description pipeline return
    // storytelling personas instead of the default mode.
    expect(mockGeneratePersonasAction).toHaveBeenCalledWith(
      "B2B SaaS founders",
      5,
      "strategy",
    );

    // What the caller observes once the stream reports DONE: the batch and its
    // personas are in the store and surfaced by the hook.
    await act(async () => {
      await vi.waitFor(() => {
        expect(usePersonaStore.getState().batches).toHaveLength(1);
      });
    });

    const batch = usePersonaStore.getState().batches[0];
    expect(batch.source).toBe("description");
    expect(batch.personas).toEqual([strategyPersona]);
    expect(result.current.personas).toEqual([strategyPersona]);
    expect(result.current.lastCompletedBatchId).toBe(batch.id);
  });
});
