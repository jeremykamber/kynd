/**
 * Consensus claims, derived instead of trusted.
 *
 * The cohort synthesis is one LLM call, and its prose was the last place the
 * model could overstate: with counts already derived from citations, a finding
 * could still read "all three flagged" while its citation set held one persona,
 * and the research question answer could invert the cohort outright ("most
 * would not commit" while all five said they would).
 *
 * Two mechanical rules close that gap:
 * 1. A quantifier in finding prose becomes the derived count it claims to
 *    report ("all three" -> "1 of 3 personas"). The number is the citation set,
 *    never the model's word.
 * 2. The research question answer is composed from the personas' own answers
 *    instead of generated: the per-persona answer is the authoritative record,
 *    so the cohort answer cannot contradict it.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const COUNT = '(one|two|three|four|five|six|seven|eight|nine|ten)';

/**
 * Replaces universal/majority quantifiers with `affected of total personas`.
 * Only phrases that assert how many personas did something are touched; a
 * "most of the page" is left alone because it is not a claim about personas.
 */
export function restatePersonaQuantifiers(
  text: string,
  affected: number,
  total: number,
): string {
  if (!text || total <= 0) return text;
  const claim = `${affected} of ${total} personas`;

  return text
    // "all three personas" must not become "3 of 3 personas personas".
    .replace(new RegExp(`\\ball (?:of the |the )?${COUNT}( personas)?\\b`, 'gi'), claim)
    .replace(/\ball (?:of the )?(?:personas|participants)\b/gi, claim)
    .replace(/\ball of them\b/gi, claim)
    // "nearly everyone" first: the bare "everyone" rule would leave "Nearly …".
    .replace(/\bnearly everyone\b/gi, claim)
    .replace(/\bnearly all (?:the )?(?:personas|participants)\b/gi, claim)
    .replace(/\bevery(?: single)? persona\b/gi, claim)
    .replace(/\beveryone\b/gi, claim)
    .replace(/\bmost (?:of the )?(?:personas|participants)\b/gi, claim)
    .replace(/\bthe whole cohort\b/gi, claim);
}

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
