# Analysis writing style

The analysis output is a short research note, not marketing copy. A reader
should finish the answer, the findings, and the journey and know what the
evidence shows, what it does not show, and what to test next.

The pipeline applies the condensed rules in
[`src/application/prompts/analysisWritingStyle.ts`](../src/application/prompts/analysisWritingStyle.ts).
This file explains them and shows what they change.

## The rules

1. **Plain English.** Short sentences, about 15 words or fewer. One idea per
   sentence. If a sentence needs a second comma to survive, split it.
2. **Active voice.** Name the actor. "The persona missed the price" beats
   "the price was missed".
3. **No em dashes.** Use a comma, a period, or parentheses. The em dash invites
   the long, stacked clause that makes a finding hard to check.
4. **No hype.** Remove "seamless", "powerful", "game-changing",
   "revolutionary", "delightful", and every adjective that could describe any
   product. A research note earns interest with the observation, not the
   adjective.
5. **Concrete nouns and verbs.** Write "the persona stopped at the plan
   toggle", not "there was a friction event at the pricing stage".
6. **One term, one meaning.** Define a term the first time it appears, then use
   that term. Do not rotate synonyms for variety.
7. **Observation before interpretation.** State what happened. Then say why it
   matters. Do not blend the two into a single claim the reader cannot check.
8. **Do not overstate.** "All", "most", and "none" are claims about the cohort.
   Use them only when the evidence supports the count. If the cohort split,
   say how.
9. **Third person.** The report is about the personas. It does not address the
   reader as "you".
10. **No recommendations.** The report describes the evidence. The product team
    decides what to do with it. A finding can name what would be tested; it
    does not tell the reader to build it.

## Special rules

### The cohort answer

The answer is two to four sentences. It answers the research question for the
whole cohort, not one persona at a time. It must agree with the per-persona
answers below it.

- Do not list each persona's answer. The individual reports already carry them.
- If the cohort split, state the split and the reason.
- If the cohort agreed, say so plainly and name the main condition.
- Keep it short. The answer is the first thing a reader sees and the easiest
  place to lose them.

### Journey stages

Each stage has a description and an outcome: `succeeded`, `blocked`, or
`stopped`. The description must agree with the outcome.

- A succeeded stage describes what enabled the persona to move on. It does not
  describe a failure.
- A blocked or stopped stage names the blocker and where the journey ended.
- Once a stage is blocked or stopped, every later stage is `stopped` and its
  description starts "Not reached".
- Negative sentiment can still succeed. The rule is about the outcome, not the
  mood: a persona can dislike the page and still understand it well enough to
  continue.

## Before and after

**Before**

> The user is absolutely blown away by the seamless, game-changing experience —
> they immediately want to buy, but the pricing page was a bit confusing which
> is a friction point.

**After**

> The persona understood the offer in one pass. The price was the only open
> question. The plan toggle hid the monthly option, and the persona stopped
> there.

The second version separates the observation from the reason, removes the
hype, drops the em dash, and makes the outcome checkable.

## Where it applies

- `overview`
- `researchQuestionAnswer`
- `topFindings` (observation, evidence, impact)
- `disagreements`
- `biggestFrictions`
- each journey stage's `description` and `transition`
- the persona-level `overview` and `researchQuestionAnswer`

Persona monologues are raw think-aloud speech, not report prose. They keep
their own voice rules.
