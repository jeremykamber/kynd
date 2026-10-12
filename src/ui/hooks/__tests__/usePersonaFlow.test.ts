import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// The ICP flow (usePersonaFlow) must always generate strategy-mode personas.
const mockGeneratePersonasAction = vi.hoisted(() => vi.fn());
const mockRouterPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => "/dashboard/new",
}));
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
    mockRouterPush.mockReset();
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

    // The run settles into the results view: the batch is active and the form
    // page has navigated away from itself.
    expect(usePersonaStore.getState().activeBatchId).toBe(batch.id);
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("keeps the submit state for the whole run and names the batch from the description", async () => {
    let releaseStream: () => void = () => {};
    // Executor form: the project's lib target (ES2017) has no Promise.withResolvers.
    const gate = new Promise<void>((resolve) => { releaseStream = resolve });

    mockGeneratePersonasAction.mockResolvedValue({
      runId: "run-2",
      streamData: (async function* () {
        yield { step: "GENERATING_BACKSTORIES", completedCount: 0, totalCount: 1 };
        await gate;
        yield { step: "DONE", personas: [strategyPersona] };
      })(),
    });

    const { result } = renderHook(() => usePersonaFlow());

    await act(async () => {
      result.current.setCustomerProfile("Small business owners in local retail");
    });
    await act(async () => {
      result.current.handleGeneratePersonas();
    });

    // Mid-run: the button's disabled state and label come from here.
    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });
    });

    await act(async () => {
      releaseStream();
      // Wait on the store: it is external, so a settled run is observable
      // inside the act scope. React state only lands when the scope flushes,
      // so `result.current` is asserted after it.
      await vi.waitFor(() => {
        expect(usePersonaStore.getState().batches).toHaveLength(1);
      });
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(usePersonaStore.getState().batches[0].label).toBe(
      "Small business owners in local retail",
    );
  });

  it("names the batch from the description when the toaster wrote it first", async () => {
    let releaseStream: () => void = () => {};
    const gate = new Promise<void>((resolve) => { releaseStream = resolve });

    mockGeneratePersonasAction.mockResolvedValue({
      runId: "run-3",
      streamData: (async function* () {
        await gate;
        yield { step: "DONE", personas: [strategyPersona] };
      })(),
    });

    const { result } = renderHook(() => usePersonaFlow());

    await act(async () => {
      result.current.setCustomerProfile("Small business owners in local retail");
    });
    await act(async () => {
      result.current.handleGeneratePersonas();
    });

    // The background toaster settles the run first and can only give the row a
    // generic count label; the page that holds the description renames it.
    usePersonaStore.getState().addBatch({
      id: "batch-from-toaster",
      label: "1 Persona Generated",
      source: "description",
      createdAt: new Date().toISOString(),
      personas: [strategyPersona],
      runId: "run-3",
    });

    await act(async () => {
      releaseStream();
      // The rename lands in the store before the hook's own state flushes.
      await vi.waitFor(() => {
        expect(
          usePersonaStore.getState().batches.find((b) => b.runId === "run-3")?.label,
        ).toBe("Small business owners in local retail");
      });
    });

    expect(result.current.isSubmitting).toBe(false);

    const batch = usePersonaStore.getState().batches.find((b) => b.runId === "run-3");
    expect(batch?.label).toBe("Small business owners in local retail");
    expect(usePersonaStore.getState().activeBatchId).toBe("batch-from-toaster");
  });
});
