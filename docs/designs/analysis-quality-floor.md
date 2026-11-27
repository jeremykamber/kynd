# analysis-quality-floor

> Status: the user chose Option C on 2026-11-24. This file is the evidence and
> option comparison. The full design is in
> [option-c-quality-system.md](option-c-quality-system.md). The recommendation
> below is the prior recommendation, not the decision.

Interactive version: [analysis-quality-floor.html](analysis-quality-floor.html)

## Model

### Behaviour today

One `generateCohortSynthesis` call reads the raw monologues and the per-persona
answers. It writes `overview`, `researchQuestionAnswer`, `topFindings`,
`disagreements`, and `biggestFrictions` as free prose.

`groundSynthesisCitations` resolves anchor phrases to verbatim quotes and
derives `affectedPersonaCount` from the resolved citations. That fixed the
inflated-count defect. It does not check whether the quote supports the
observation, and it does not check the prose against the counts.

The latest local smoke output (`.sisyphus/verify/2026-11-23T20-10-42-746Z-artifact.json`)
shows the remaining class:

- `overview`: "All three personas hit the same wall: routing rules ... behind
  the Growth tier."
- `disagreements`: one persona accepted the cost, one called it a blocker, and
  the third is absent from the split.
- `researchQuestionAnswer`: "The pricing split blocked the other two." Harper
  was blocked at `action` because the brief offered no beta sign-up, not by
  price.

This is one free-prose layer contradicting the per-persona record. It is not a
prompt typo. The same layer produced the blind-review failures.

### Blind-review evidence

Artifact-analysis reports, ten runs per round, ten blind reviewers per round,
five roles. The 8/10 floor is the median blind score per round.

| Round | Clean runs | Median | Mean | Pass |
|---|---:|---:|---:|---:|
| 1 | 10/10 | 6/10 | 5.7 | 0/10 |
| 2 | 10/10 | 6/10 | 5.7 | 0/10 |
| 3 | 10/10 | 5/10 | 5.4 | 0/10 |
| 4 | 10/10 | 5/10 | 5.0 | 0/10 |

| Reviewer | Specificity | Grounding | Differentiation | Actionability |
|---|---:|---:|---:|---:|
| Investor | 7 | 5 | 6 | 5 |
| Founder | 8 | 5 | 3 | 6 |
| PM | 8 | 5 | 4 | 6 |
| Marketer | 9 | 6 | 6.5 | 7.5 |
| Growth | 8 | 6 | 7 | 8 |

Specificity is already good. Grounding and differentiation are the floor.
Actionability follows the answer, so it rises only when the answer is true.

Named defects:

1. A citation supports the opposite of its observation.
2. A finding claims five personas and supplies three citations.
3. A disagreement split omits personas or overlaps buckets.
4. Free prose invents arithmetic and org facts that the artifact contradicts.
5. All personas share one reasoning spine, one objection, and one reading order.
6. Persona roles, pronouns, and buyers drift between the sheet and the summary.
7. The five-stage funnel has no anchor for a video script, so drop-off collapses.

The blind review also showed that rewriting "all" to the citation count made the
score worse: a reaction supported by eight personas was reported as "3 of 8"
because only three citations were supplied. Counts must come from a complete
claim set, not from whatever anchors the model happened to emit.

### Components and owners

| Component | Responsibility |
|---|---|
| `AnalyzeArtifactUseCase` | Produces one `PersonaResponse` per persona |
| `SynthesizeArtifactResultsUseCase` | Turns the cohort into `ArtifactSynthesis` |
| `VisionAnalysisAdapter.generateCohortSynthesis` | Writes the free-prose synthesis |
| `groundSynthesisCitations` | Resolves anchors and derives citation counts |
| `verify-output` | Proves structure, not semantic quality |

### Unknowns

- IOU-1: the blind-review files live on the VPS at
  `~/mission-evidence/kynd-text-input/`. No local copy. The aggregate is
  reproduced above; quote-level examples come from the blind reviewer sessions.
- IOU-2: extra-call latency and cost for the support gate. Measure before
  committing to a per-finding call. Batch all findings into one call.
- IOU-3: whether five personas are enough for stable "all/most" claims. The
  blind rounds used different batches, so the floor is not a per-count result.

## Decision

No single prompt change reaches 8/10. The score needs two structural changes:
remove free-prose aggregation, and make personas reason from different tasks.
A third change, an artifact fact sheet, is required for numbers and for video.

### Option A: semantic verifier only

Keep the current synthesis. Add one batched support check: each finding's
observation, citations, and transcript excerpt go to a verifier. Drop or repair
findings the citations do not support.

- Cost: small diff, one extra LLM call per run.
- Fixes: some inverted or unsupported citations.
- Does not fix: free-prose arithmetic, incomplete disagreement splits,
  homogenized personas, identity drift.
- Failure I would lose sleep over: the verifier accepts a plausible but wrong
  claim, and the report still says "all three" for two.

### Option B: derived aggregates plus support gate

Stop asking one call to write findings and counts. Build a claim set from the
per-persona structured output. Cluster claims. Let code own counts, citations,
disagreement arithmetic, and the answer's quantifiers. Use the verifier only
for semantic support.

- Cost: larger diff; one clustering call and one support call per run; new
  validation module; no model or provider change.
- Fixes: the class where prose contradicts the record. Makes disagreements
  complete by construction. Makes "all/most" a computed fact.
- Does not fix: one reasoning spine in costumes, role drift, video anchors.
- Failure I would lose sleep over: over-constrained synthesis becomes bland,
  or clusters merge two different objections into one finding.

### Option C: full quality program

Option B plus:

- a decision-role matrix in persona generation: economic buyer, daily user,
  blocker, champion, with different current tools and switching triggers;
- a persona-specific task and entry point for the monologue, not a shared
  "read the big text first" instruction;
- a structured `verdict` and `decisiveReason` per persona, so disagreements use
  a fact instead of prose;
- an artifact fact sheet: product, audience, offer, exact prices, tier features,
  claims, CTA, proof, and open questions. The synthesis checks findings and
  arithmetic against it;
- `contentKind` plus an optional stage anchor for documents and video scripts.

The role, task, and entry point are assigned. The verdict is not. Every role and
every artifact uses the same four values: `adopt`, `trial`, `reject`, or
`undecided`. The persona chooses one and records a `decisiveReason` with
evidence. A role sets the lens, not the answer. Do not generate a new set per
run. `contentKind` changes the decision question and stage anchor, not the enum.

- Cost: most work; more LLM calls; longer runs; additive domain fields; UI can
  ignore the new fields at first.
- Fixes: differentiation (the 3/10 axis), role drift, arithmetic, and video
  schema fit.
- Failure I would lose sleep over: more machinery creates theater without
  better decisions, and latency regresses.

### Recommendation

Take Option B as the first slice. It deletes the proven failing class and is
the prerequisite for Option C: a claim ledger makes persona divergence and
artifact facts enforceable. Do not start with C's persona work alone, because
the aggregate would still invent facts from good monologues.

## First slice: derived synthesis

### Contract

Input is unchanged: `PersonaResponse[]`, `researchQuestion`, completed and
failed counts. Output is unchanged: `ArtifactSynthesis`.

New internal shape:

```
PersonaResponse[]
  -> Claim[]                    one claim per finding, friction, and verdict signal
  -> Cluster[]                  LLM groups claims by topic and stance
  -> cite and count             code resolves anchors and counts distinct personas
  -> SupportVerdict[]           LLM checks citation supports observation
  -> overview and answer        written from the surviving cluster table
  -> validate                   counts, quantifiers, splits, names
  -> ArtifactSynthesis
```

`Claim` carries `personaId`, `topic`, `stance`, `observation`, `anchor`, and
`stage`. A claim with no verbatim anchor cannot enter a cohort finding.

`Cluster` carries `topic`, `stance`, `personaIds`, and one anchor per persona.
Counts are `new Set(personaIds).size`. No model-written count is trusted.

`SupportVerdict` is `support | partial | unsupported`, plus a one-sentence
reason. `unsupported` findings are dropped. `partial` findings are kept only
after the observation is narrowed to the quote.

### Failure paths

- No completed responses: return no synthesis, as today.
- Clustering fails: fall back to the per-persona answers and a deterministic
  overview built from verdicts. Do not emit free-prose findings.
- Support call fails: drop findings without a support verdict. Keep the answer
  only if it names no count.
- Fewer than two personas support a finding: demote it to a per-persona
  observation, not a cohort finding.
- Disagreement split does not sum to the completed count: omit the
  disagreement and log it. Never render an incomplete split.
- Validator rejects the prose: one repair call, then deterministic fallback.
- Universal quantifier appears without a computed count: remove the sentence,
  not just the word.

### Acceptance tests

Write these in Vitest under `src/application/synthesis/__tests__/`.

1. A finding whose only citation supports the opposite observation is dropped.
2. A finding with three citations and five claimed personas reports three, and
   the overview cannot say "all five".
3. A disagreement split of 1 and 1 against a cohort of 3 is rejected.
4. An anchor that is not a transcript substring produces no citation and the
   count is recomputed.
5. A complete three-of-three finding survives and can say "all three".

The first and second fail on the current code. The third and fourth pass only
partly: citation grounding exists, but no validator checks the split.

### Live checkpoint

`bunx vitest run src/application/synthesis src/application/usecases/__tests__/SynthesizeArtifactResultsUseCase.test.ts`,
then a real five-persona text run through the app with the relay brief. Judge
the result against the blind rubric. The CLI has no `--text` mode today, so the
run must use the app or a small scripted action call.

### Does not touch

- models, providers, or token limits
- artifact intake or the text-input feature
- persona generation or persona fields
- the report UI, PDF, or IndexedDB shape
- artifact-agnostic prompts

## Route

1. **S1, derived synthesis plus support gate.** The proven failure class.
   Checkpoint: unit suite plus a real five-persona text run. Does not touch
   personas, intake, or UI.
2. **S2, divergent simulation.** Decision roles, task-specific entry points,
   `verdict`, `decisiveReason`, identity check. Checkpoint: blind
   differentiation score on one fixed artifact. Does not touch synthesis
   counts.
3. **S3, artifact fact sheet and content kind.** Exact claims and prices in the
   synthesis; optional stage anchors for documents and video. Checkpoint: a
   video script produces a real drop-off point and no invented arithmetic.
4. **S4, quality harness.** Five reviewer roles, ten artifacts, median score,
   zero systematic defects. Checkpoint: the 8/10 gate can fail a run.

## Questions for the user

- Which slice scares you most: the synthesis rewrite, the persona divergence,
  or the extra calls?
- Is Option B the first PR, or do you want Option C planned as one program?
- Is a batched support call acceptable, or must the run stay at the current
  call count?
