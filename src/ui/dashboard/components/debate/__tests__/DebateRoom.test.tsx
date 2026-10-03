import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DebateRoom } from "../DebateRoom";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";
import type { DebateRoom as DebateRoomType } from "@/domain/entities/DebateRoom";

const mockStartDebate = vi.hoisted(() => vi.fn());

vi.mock("@/ui/hooks/useDebate", () => ({
  useDebate: () => ({ startDebate: mockStartDebate }),
}));

const mockPersona: Persona = {
  id: "p1", name: "Alice Chen", age: 38,
  occupation: "CTO", educationLevel: "MSc",
  interests: [], goals: [],
  conscientiousness: 50, neuroticism: 50, openness: 50,
  extraversion: 50, agreeableness: 50,
  values: [], fears: [],
  communicationStyle: "", decisionStyle: "",
  pricingSensitivity: 50, typicalBudget: "",
};

function setupStore(
  overrides: { status?: DebateRoomType["status"]; error?: string } = {},
) {
  useDebateStore.setState({
    debates: [{
      id: "d1",
      proposal: "Raise prices 60%",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: overrides.status ?? "in_progress",
      error: overrides.error,
      createdAt: new Date().toISOString(),
    }],
    activeDebateId: "d1",
    isStreaming: false,
  });
}

describe("DebateRoom", () => {
  beforeEach(() => {
    localStorage.clear();
    mockStartDebate.mockReset();
    useDebateStore.setState({
      debates: [],
      activeDebateId: null,
      isStreaming: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows empty state when no active debate", () => {
    render(<DebateRoom />);
    expect(screen.getByText(/Select a debate/)).toBeTruthy();
  });

  it("renders debate header with proposal and round info", () => {
    setupStore();
    render(<DebateRoom />);
    expect(screen.getByText(/Raise prices 60%/)).toBeTruthy();
    expect(screen.getByText(/Round 1 of 3/)).toBeTruthy();
  });

  it("shows participants in the header", () => {
    setupStore();
    render(<DebateRoom />);
    expect(screen.getByText(/Alice Chen/)).toBeTruthy();
  });

  it("renders a human-readable message and a retry control for an errored debate", () => {
    setupStore({
      status: "error",
      error: "TypeError: streamData is not async iterable",
    });
    render(<DebateRoom />);

    expect(screen.getByText(/Debate failed/)).toBeTruthy();
    expect(screen.getByText(/stopped responding/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("keeps the raw engine error behind a technical-details affordance", () => {
    setupStore({
      status: "error",
      error: "TypeError: streamData is not async iterable",
    });
    render(<DebateRoom />);

    const raw = screen.getByText(/streamData is not async iterable/);
    expect(raw.closest("details")).not.toBeNull();
    expect(screen.getByText(/Technical details/)).toBeTruthy();
  });

  it("retries with the same proposal, participants and rounds", async () => {
    setupStore({ status: "error", error: "boom" });
    mockStartDebate.mockResolvedValue("d2");
    render(<DebateRoom />);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(mockStartDebate).toHaveBeenCalledWith(
        "Raise prices 60%",
        [mockPersona],
        3,
      ),
    );
  });

  it("does not render the interjection form for an errored debate", () => {
    setupStore({ status: "error", error: "boom" });
    render(<DebateRoom />);
    expect(
      screen.queryByPlaceholderText(/Add your perspective/),
    ).toBeNull();
  });
});
