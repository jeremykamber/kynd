import { describe, it, expect } from "vitest";
import {
  extractVerbatimQuote,
  groundSynthesisCitations,
} from "../citations";

describe("extractVerbatimQuote", () => {
  const transcript =
    "First impressions matter. The pricing page confused me! I left to compare plans?\nThen I noticed the monthly toggle. Good catch by me.";

  it("extracts the sentence containing the anchor (period boundaries)", () => {
    const q = extractVerbatimQuote(transcript, "pricing page confused");
    expect(q).toBe("The pricing page confused me!");
  });

  it("expands to full sentence around the anchor", () => {
    const q = extractVerbatimQuote(transcript, "monthly toggle");
    expect(q).toBe("Then I noticed the monthly toggle.");
  });

  it("is case-insensitive on the anchor", () => {
    const q = extractVerbatimQuote(transcript, "PRICING PAGE CONFUSED");
    expect(q).toBe("The pricing page confused me!");
  });

  it("returns null on no match", () => {
    expect(extractVerbatimQuote(transcript, "unicorn unicorn")).toBeNull();
  });

  it("returns null for empty transcript or empty anchor", () => {
    expect(extractVerbatimQuote("", "anything")).toBeNull();
    expect(extractVerbatimQuote(transcript, "")).toBeNull();
    expect(extractVerbatimQuote(transcript, "   ")).toBeNull();
  });

  it("handles anchor at the very start", () => {
    const q = extractVerbatimQuote(transcript, "First impressions");
    expect(q).toBe("First impressions matter.");
  });

  it("handles anchor at the very end (no trailing ender)", () => {
    const q = extractVerbatimQuote(transcript, "Good catch");
    expect(q).toBe("Good catch by me.");
  });

  it("first occurrence wins on multiple matches", () => {
    const t = "I love the dashboard. It is fast. I love the dashboard more each day.";
    const q = extractVerbatimQuote(t, "love the dashboard");
    expect(q).toBe("I love the dashboard.");
  });

  it("newline acts as a sentence ender", () => {
    const t = "Opened the app\nThe sidebar was hidden";
    const q = extractVerbatimQuote(t, "sidebar was hidden");
    expect(q).toBe("The sidebar was hidden");
  });

  it("anchor at the start of a sentence after a newline", () => {
    const t = "Line one ends here\nAnchor sentence. Following text.";
    const q = extractVerbatimQuote(t, "Anchor sentence");
    expect(q).toBe("Anchor sentence.");
  });

  it("never cuts a quote at an ellipsis pause", () => {
    const t = "No card means I can just... try it. Tonight. On the launch email.\nThen I closed the tab.";
    expect(extractVerbatimQuote(t, "I can just")).toBe("No card means I can just... try it.");
  });

  it("strips stray quote marks at the quote boundary", () => {
    // The observed defect: a quote that started on a quoted artifact line
    // began with the opening quote mark ("No credit card for the first…").
    const t = 'It loaded fast. "No credit card for the first analysis." Then I looked for the price.';
    expect(extractVerbatimQuote(t, "No credit card for the first analysis")).toBe(
      "No credit card for the first analysis.",
    );
  });

  it("result is always a verbatim substring", () => {
    const t = "Ein Satz mit Ümläuten und 'emoji'. Zweiter Satz.";
    const q = extractVerbatimQuote(t, "Ümläuten");
    expect(t).toContain(q);
  });
});

describe("groundSynthesisCitations", () => {
  const transcripts = [
    {
      personaId: "p-1",
      personaName: "Sarah Chen",
      transcript:
        "The pricing page confused me completely. I looked for a monthly option but found none.",
    },
    {
      personaId: "p-2",
      personaName: "Miguel Torres",
      transcript:
        "Setup was quick. However the enterprise tier hides SSO behind a sales call.",
    },
  ];

  const baseFinding = {
    observation: "Pricing opacity blocks action",
    evidence: "Both personas hit pricing walls",
    impact: "Drop-off before trial",
    confidence: "strongly supported" as const,
    affectedPersonaCount: 2,
    totalPersonaCount: 2,
  };

  it("resolves locators into verbatim citations with denormalized names", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" },
            { personaId: "p-2", uniqueAnchorPhrase: "hides SSO behind a sales call" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toEqual([
      { personaId: "p-1", personaName: "Sarah Chen", quote: "The pricing page confused me completely." },
      { personaId: "p-2", personaName: "Miguel Torres", quote: "However the enterprise tier hides SSO behind a sales call." },
    ]);
  });

  it("derives counts from resolved citations, ignoring the model's numbers", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          affectedPersonaCount: 5,
          totalPersonaCount: 8,
          evidenceLocators: [{ personaId: "p-2", uniqueAnchorPhrase: "hides SSO" }],
        },
      ],
      transcripts,
    );
    expect(out.affectedPersonaCount).toBe(1);
    expect(out.totalPersonaCount).toBe(transcripts.length);
  });

  it("counts zero when no locator resolves, even if the model claimed support", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          affectedPersonaCount: 2,
          totalPersonaCount: 2,
          evidenceLocators: [{ personaId: "p-1", uniqueAnchorPhrase: "a sentence she never said" }],
        },
      ],
      transcripts,
    );
    expect(out.citations).toBeUndefined();
    expect(out.affectedPersonaCount).toBe(0);
    expect(out.totalPersonaCount).toBe(transcripts.length);
  });

  it("drops locators for unknown personas", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "ghost", uniqueAnchorPhrase: "anything" },
            { personaId: "p-1", uniqueAnchorPhrase: "monthly option" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toHaveLength(1);
    expect(out.citations![0].personaId).toBe("p-1");
  });

  it("drops locators whose anchor misses the transcript", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "quantum flux capacitor" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toBeUndefined();
  });

  it("deduplicates identical quotes within one finding", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" },
            { personaId: "p-1", uniqueAnchorPhrase: "confused me completely" },
          ],
        },
      ],
      transcripts,
    );
    expect(out.citations).toHaveLength(1);
  });

  it("strips evidenceLocators from the output — anchors never leak", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [{ personaId: "p-1", uniqueAnchorPhrase: "pricing page confused" }],
          ...(JSON.parse('{"fabricated":"field"}') as object),
        } as never,
      ],
      transcripts,
    );
    expect(out).not.toHaveProperty("evidenceLocators");
    expect(out).not.toHaveProperty("fabricated");
    expect(out.citations).toHaveLength(1);
  });

  it("keeps finding identity fields intact while grounding", () => {
    const [out] = groundSynthesisCitations(
      [
        {
          ...baseFinding,
          evidenceLocators: [
            { personaId: "p-1", uniqueAnchorPhrase: "monthly option" },
            { personaId: "p-1", uniqueAnchorPhrase: "found none" },
            { personaId: "p-1", uniqueAnchorPhrase: "an anchor she never spoke" },
            { personaId: "p-2", uniqueAnchorPhrase: "hides SSO" },
          ],
        },
      ],
      transcripts,
    );

    // Identity fields survive grounding verbatim.
    expect(out.observation).toBe(baseFinding.observation);
    expect(out.evidence).toBe(baseFinding.evidence);
    expect(out.impact).toBe(baseFinding.impact);
    expect(out.confidence).toBe("strongly supported");
    expect(out.affectedPersonaCount).toBe(2);
    expect(out.totalPersonaCount).toBe(2);

    // The citations are the sentences actually located in each persona's
    // transcript — not the anchor phrases. The fabricated anchor is dropped,
    // and the two anchors resolving to the same p-1 sentence collapse into one.
    expect(out.citations).toEqual([
      {
        personaId: "p-1",
        personaName: "Sarah Chen",
        quote: "I looked for a monthly option but found none.",
      },
      {
        personaId: "p-2",
        personaName: "Miguel Torres",
        quote: "However the enterprise tier hides SSO behind a sales call.",
      },
    ]);
    for (const citation of out.citations!) {
      const transcript = transcripts.find((t) => t.personaId === citation.personaId)!;
      expect(transcript.transcript).toContain(citation.quote);
    }
  });
});

describe("extractVerbatimQuote — decimals and escapes", () => {
  it("does not end a sentence at a decimal point", () => {
    const t = "What's 1.4 even mean — 1.4 views each, so most analyses get viewed once?\\nThen I moved on.";
    expect(extractVerbatimQuote(t, "1.4 even mean")).toBe(
      "What's 1.4 even mean — 1.4 views each, so most analyses get viewed once?",
    );
  });
});
