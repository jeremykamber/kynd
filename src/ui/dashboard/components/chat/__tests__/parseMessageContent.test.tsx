import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseMessageContent } from "../parseMessageContent";

describe("parseMessageContent", () => {
  it("renders bold markdown instead of raw asterisks", () => {
    const { container } = render(<div>{parseMessageContent("**pricing** is the blocker")}</div>);
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.textContent).toContain("pricing is the blocker");
    // Raw asterisks must not leak through.
    expect(container.textContent).not.toContain("**");
  });

  it("renders lists and italic markdown", () => {
    const { container } = render(
      <div>{parseMessageContent("1. show the price\n2. prove the claims\n\n*skeptical of the claims*")}</div>,
    );
    // One ordered list, whose items keep their text and their order.
    const items = Array.from(container.querySelectorAll("ol li")).map((li) => li.textContent);
    expect(items).toEqual(["show the price", "prove the claims"]);
    // The italic half of the title: emphasis renders as <em>, not raw asterisks.
    expect(container.querySelector("em")?.textContent).toBe("skeptical of the claims");
    expect(container.textContent).not.toContain("*");
  });

  it("preserves single newlines as line breaks (no whitespace collapse)", () => {
    const { container } = render(<div>{parseMessageContent("line one\nline two")}</div>);
    expect(container.textContent).toContain("line one");
    expect(container.textContent).toContain("line two");
    // remark-breaks keeps the line break instead of collapsing to a space.
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("extracts reasoning into a ThinkingBlock", () => {
    const { container } = render(
      <div>{parseMessageContent("<<REASONING>>inner plan<</REASONING>>answer")}</div>,
    );
    // Collapsed ThinkingBlock shows its toggle; the reasoning body is hidden.
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).toContain("answer");
    // The reasoning markers themselves are consumed.
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });

  it("renders every reasoning block, not just the first", () => {
    const { container } = render(
      <div>
        {parseMessageContent(
          "<<REASONING>>first thought<</REASONING>>answer text<<REASONING>>second thought<</REASONING>>",
        )}
      </div>,
    );
    const toggles = container.querySelectorAll("button");
    // One ThinkingBlock toggle per reasoning block.
    expect(toggles.length).toBe(2);
    expect(container.textContent).toContain("answer text");
    expect(container.textContent).not.toContain("<<REASONING>>");
    expect(container.textContent).not.toContain("<</REASONING>>");
  });

  it("renders reasoning appended after the answer in order", () => {
    const { container } = render(
      <div>{parseMessageContent("answer first<<REASONING>>late thought<</REASONING>>")}</div>,
    );
    const blocks = container.querySelectorAll("button");
    expect(blocks.length).toBe(1);
    // Body renders before the reasoning toggle.
    const children = Array.from(container.children[0].children ?? container.children);
    expect(children[0].textContent).toContain("answer first");
  });

  it("does not leak raw markers for an unclosed mid-stream reasoning block", () => {
    const { container } = render(
      <div>{parseMessageContent("<<REASONING>>still thinking")}</div>,
    );
    // In-progress reasoning is shown as a collapsed ThinkingBlock, never as
    // raw marker text.
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).not.toContain("<<REASONING>>");
  });

  it("keeps memory markers as footnotes with superscript refs", () => {
    const { container } = render(
      <div>{parseMessageContent("I remember [Memory: my childhood dog] fondly")}</div>,
    );
    expect(container.querySelector("sup")).not.toBeNull();
    expect(container.textContent).toContain("my childhood dog");
  });

  it("renders a single-segment marker as plain prose, never the delimiters", () => {
    const { container } = render(
      <div>
        {parseMessageContent(
          'I lost $12k once <% "so now I read the cancellation policy first" %> — never twice',
        )}
      </div>,
    );
    // The statement stays; the prompt dialect's delimiters and quotes do not.
    expect(container.textContent).toContain("so now I read the cancellation policy first");
    expect(container.textContent).not.toContain("<%");
    expect(container.textContent).not.toContain("%>");
    expect(container.textContent).not.toContain('"');
  });

  it("keeps the two-segment marker as a tooltip", () => {
    const { container } = render(
      <TooltipProvider>
        <div>{parseMessageContent('<% "trust is earned" | "burned by a vendor in 2022" %>')}</div>
      </TooltipProvider>,
    );
    // The display segment is visible; the backstory remains tooltip-only.
    expect(container.textContent).toContain("trust is earned");
    expect(container.textContent).not.toContain("burned by a vendor in 2022");
    expect(container.textContent).not.toContain("<%");
    expect(container.textContent).not.toContain("|");
  });

  it("renders an unterminated marker mid-stream without leaking delimiters", () => {
    const { container } = render(
      <div>{parseMessageContent('still typing <% "half a sentence')}</div>,
    );
    expect(container.textContent).toContain("half a sentence");
    expect(container.textContent).not.toContain("<%");
  });

  it("separates a marker glued to surrounding text", () => {
    const { container } = render(
      <div>
        {parseMessageContent(
          'their support ghosted me.<% "That $12k disaster" %>So yeah, fine print first',
        )}
      </div>,
    );
    // Prose flows continuously instead of jamming the statement into its neighbours.
    expect(container.textContent).toBe(
      "their support ghosted me. That $12k disaster So yeah, fine print first",
    );
    expect(container.textContent).not.toContain("<%");
  });

  it("keeps a space between prose and a cited span glued to it", () => {
    const { container } = render(
      <TooltipProvider>
        <div>
          {parseMessageContent(
            'watch the video<% "the demo" | "why it mattered" %>and decide',
          )}
        </div>
      </TooltipProvider>,
    );
    // The cited span is a separate node; without an explicit separator it
    // renders as "videothe demoand".
    expect(container.textContent).toBe("watch the video the demo and decide");
  });

  it("does not double the space when the marker already has one", () => {
    const { container } = render(
      <TooltipProvider>
        <div>
          {parseMessageContent(
            'watch the video <% "the demo" | "why it mattered" %> and decide',
          )}
        </div>
      </TooltipProvider>,
    );
    expect(container.textContent).toBe("watch the video the demo and decide");
  });
});
