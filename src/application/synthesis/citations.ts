import type {
  EvidenceCitation,
  SynthesizedFinding,
  UnresolvedFinding,
} from "@/domain/entities/ArtifactSynthesis";
import { restatePersonaQuantifiers } from "@/application/synthesis/claims";

/**
 * The single home of citation knowledge: how an LLM anchor phrase becomes a
 * verbatim, user-facing quote. No other module knows about anchors.
 */

const SENTENCE_ENDERS = [".", "!", "?", "\n"] as const;

/**
 * A `...` inside a thought is a pause, not the end of a sentence. Treating its
 * periods as terminators produced quotes cut mid-thought ("No card means I can
 * just...") — a fragment presented as the persona's sentence.
 */
function isEllipsisDot(text: string, index: number): boolean {
  if (text[index] !== ".") return false;
  // A pause ("…") or a decimal ("1.4", "$8.5k") is not a sentence end.
  return text[index - 1] === "." || text[index + 1] === "." || /\d/.test(text[index + 1] ?? "");
}

/** Leading/trailing quote marks are artifacts of the surrounding transcript. */
function trimQuotes(value: string): string {
  return value.replace(/^[\s"'“”‘’]+/, "").replace(/[\s"'“”‘’]+$/, "");
}

/**
 * Expands an anchor phrase into the full sentence containing it, as a VERBATIM
 * substring of the transcript. Anchor lookup is case-insensitive; the first
 * occurrence wins. Boundaries extend to the nearest sentence ender
 * (. ! ? or newline) on each side of the match.
 *
 * Returns null on any miss — callers simply drop the citation. This never
 * throws and never fabricates.
 */
export function extractVerbatimQuote(transcript: string, anchor: string): string | null {
  const needle = anchor.trim().toLowerCase();
  if (!transcript || !needle) return null;

  const haystack = transcript.toLowerCase();
  const index = haystack.indexOf(needle);
  if (index === -1) return null;

  // Sentence start: the latest ender at/before the match; resume just after it.
  let start = 0;
  for (const ender of SENTENCE_ENDERS) {
    const at = haystack.lastIndexOf(ender, index);
    if (at !== -1 && at + 1 > start) start = at + 1;
  }

  // Sentence end: the earliest ender at/after the end of the anchor, skipping
  // the dots of an ellipsis so a pause never truncates the quote.
  const afterAnchor = index + needle.length;
  let end = -1;
  for (const ender of SENTENCE_ENDERS) {
    for (let at = haystack.indexOf(ender, afterAnchor); at !== -1; at = haystack.indexOf(ender, at + 1)) {
      if (isEllipsisDot(haystack, at)) continue;
      if (end === -1 || at < end) end = at;
      break;
    }
  }

  const quote = transcript.slice(start, end > -1 ? end + 1 : transcript.length);
  return trimQuotes(quote.trim()) || null;
}

/**
 * Resolves each finding's evidence locators into verbatim citations against
 * the persona transcripts. Locators that miss — unknown persona, anchor not
 * found, duplicate quote — are dropped: a finding simply ends up with fewer
 * citations, never a fabricated or placeholder one. Locator fields are
 * stripped, so anchors never leak into stored or rendered synthesis.
 */
export function groundSynthesisCitations(
  findings: UnresolvedFinding[],
  transcripts: Array<{ personaId: string; personaName: string; transcript: string }>,
): SynthesizedFinding[] {
  const byPersonaId = new Map(transcripts.map((t) => [t.personaId, t]));

  return findings.map((finding) => {
    const citations: EvidenceCitation[] = [];
    const seen = new Set<string>();

    for (const locator of finding.evidenceLocators ?? []) {
      const persona = byPersonaId.get(locator.personaId);
      if (!persona) continue;

      const quote = extractVerbatimQuote(persona.transcript, locator.uniqueAnchorPhrase);
      if (!quote) continue;

      const dedupeKey = `${locator.personaId}\u0000${quote}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      citations.push({ personaId: persona.personaId, personaName: persona.personaName, quote });
    }

    // Counts are derived, never trusted from the model: a finding affects the
    // personas its resolved citations belong to, out of the run's persona set.
    // The model's own numbers were inflated (5/5 for a claim one persona made).
    const affectedPersonaCount = new Set(citations.map((c) => c.personaId)).size;

    // Explicit reconstruction (not spread) guarantees evidenceLocators and
    // anything else the LLM added cannot survive into user-facing content.
    return {
      // Prose quantifiers become the derived count; the model's "all three"
      // cannot outlive a single citation.
      observation: restatePersonaQuantifiers(finding.observation, affectedPersonaCount, transcripts.length),
      evidence: restatePersonaQuantifiers(finding.evidence, affectedPersonaCount, transcripts.length),
      impact: restatePersonaQuantifiers(finding.impact, affectedPersonaCount, transcripts.length),
      confidence: finding.confidence,
      affectedPersonaCount,
      totalPersonaCount: transcripts.length,
      ...(citations.length > 0 ? { citations } : {}),
    };
  });
}
