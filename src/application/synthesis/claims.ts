/**
 * Consensus claims, derived instead of trusted.
 *
 * The cohort synthesis is one LLM call, and its prose was the last place the
 * model could overstate: with counts already derived from citations, a finding
 * could still read "all three flagged" while its citation set held one persona,
 * and the research question answer could invert the cohort outright ("most
 * would not commit" while all five said they would).
 *
 * Attempted and reverted: rewriting every "all three"/"most" in finding prose
 * into its citation count. Ten blind reviews measured it as harmful — a claim
 * eight of eight personas supported became "3 of 8" because the model had cited
 * three, so the rewrite replaced one wrong number with another and understated
 * real consensus (median review score fell 6 -> 5).
 *
 * What survives is the rule that removes a whole class instead of patching
 * prose: the research question answer is composed from the personas' own
 * answers, verbatim, so the cohort answer cannot contradict the record.
 */

/** The personas' own answers, verbatim, with the derived tally in front. */
export function composeResearchQuestionAnswer(
  responses: Array<{ personaName: string; answer: string }>,
  researchQuestion: string,
): string {
  if (responses.length === 0) return '';
  const tally = `${responses.length} of ${responses.length} personas answered; their answers follow verbatim.`;
  const lines = responses
    .map((r) => `${r.personaName}: ${r.answer.trim()}`)
    .join('\n\n');
  return `${tally} Research question: ${researchQuestion}\n\n${lines}`;
}
