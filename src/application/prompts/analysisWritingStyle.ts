/**
 * House style for every prose field in an analysis report.
 *
 * This is the enforced copy: the persona extraction prompt and the cohort
 * synthesis prompt both import it. `docs/ANALYSIS_WRITING_STYLE.md` explains
 * the same rules for humans. Keep the two in sync; the prompt is what the
 * model actually sees.
 *
 * The bar is a short research note, not marketing copy. ASD-STE100 is the
 * reference point, not a straitjacket: short sentences, active voice, one idea
 * at a time, no em dashes, no hype. The audience is a product team that has to
 * act on the finding, so precision beats flourish.
 */
export const ANALYSIS_WRITING_RULES = `- Write plain English. Use short sentences, about 15 words or fewer. One idea per sentence.
- Use the active voice and name the actor.
- Do not use em dashes. Use a comma, a period, or parentheses.
- Do not use hype or filler. Avoid "seamless", "powerful", "game-changing", "revolutionary", and similar words.
- Prefer concrete nouns and verbs. Do not turn verbs into abstract nouns.
- Define a term once, then use the same term.
- State the observation first, then the interpretation. Keep the two separate.
- Do not overstate. Use "all", "most", or "none" only when the evidence supports it.
- Write in the third person about the personas. Do not address the reader as "you".
- Do not give recommendations. Describe what the evidence shows.`;
