import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DebateRoom } from "../DebateRoom";
import { useDebateStore } from "@/ui/stores/debateStore";
import type { Persona } from "@/domain/entities/Persona";

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

function setupStore() {
  useDebateStore.setState({
    debates: [{
      id: "d1",
      proposal: "Raise prices 60%",
      participants: [mockPersona],
      messages: [],
      currentRound: 1,
      totalRounds: 3,
      status: "in_progress",
      createdAt: new Date().toISOString(),
    }],
    activeDebateId: "d1",
    isStreaming: false,
  });
}

describe("DebateRoom", () => {
  beforeEach(() => {
    localStorage.clear();
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

});
