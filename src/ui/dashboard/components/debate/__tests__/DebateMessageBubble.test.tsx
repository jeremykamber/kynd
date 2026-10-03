import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DebateMessageBubble } from "../DebateMessageBubble";

describe("DebateMessageBubble", () => {
  it("renders a participant message with avatar and name", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "1",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "I have concerns about this proposal.",
          order: 0,
        }}
        occupation="CTO"
      />,
    );

    expect(screen.getByText("Alice Chen")).toBeTruthy();
    expect(screen.getByText("CTO")).toBeTruthy();
    expect(screen.getByText("I have concerns about this proposal.")).toBeTruthy();
    expect(screen.getByText("AC")).toBeTruthy(); // initials
  });

  it("renders a user message with different styling", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "2",
          personaId: "user",
          personaName: "You",
          role: "user",
          round: 2,
          content: "What about a compromise?",
          order: 5,
        }}
      />,
    );

    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("What about a compromise?")).toBeTruthy();
  });

  it("renders empty content for streaming placeholder", () => {
    render(
      <DebateMessageBubble
        message={{
          id: "3",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "",
          order: 1,
        }}
        occupation="CTO"
        isStreaming
      />,
    );

    // Should show a typing indicator
    expect(screen.getByTestId("typing-indicator")).toBeTruthy();
  });

  it("collapses reasoning and shows only the answer, never the raw tags", () => {
    const { container } = render(
      <DebateMessageBubble
        message={{
          id: "4",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "<<REASONING>>internal plan<</REASONING>>The actual answer",
          order: 0,
        }}
        occupation="CTO"
      />,
    );

    expect(container.textContent).toContain("The actual answer");
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });

  it("does not leak tag text while a reasoning block is still streaming unclosed", () => {
    const { container } = render(
      <DebateMessageBubble
        message={{
          id: "5",
          personaId: "p1",
          personaName: "Alice Chen",
          role: "participant",
          round: 1,
          content: "<<REASONING>>still deliberating, no closing tag yet",
          order: 0,
        }}
        occupation="CTO"
        isStreaming
      />,
    );

    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });
});
