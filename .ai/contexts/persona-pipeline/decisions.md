# persona-a-profile-backstory

Status: accepted

Decision: Split persona generation into a batched profile call, per-persona parallel backstory calls (named, third-person), then the existing PB&J rationalization pass.

Context: One LLM call generated every persona's full structure at once — slow, one failure surface, and field-skipping under output-budget pressure (backstory usually dropped last).

Alternatives: two-phase batched backstories (b); per-persona parallel profiles (rejected — same-input parallel calls homogenize, diversity needs in-batch prompting); lazy/on-demand backstories (rejected — verify judge requires backstory at generation time); stream+salvage single-call (doesn't fix the latency wall).

Reason: smallest coherent change — reuses generatePersonaArray, rationalizePersonas, and the existing progress steps; the profile/story seam matches what personas are made of; per-persona isolation (user priority) on the risky phase.

Failure mode to watch: profile call still large — per-phase required-field validation + retry nudge; a backstory call failing after retries fails the whole run loudly (no hollow personas).

Verification: verify-output --mode strategy and --mode research pass REQUIRED_PERSONA_FIELDS; backstories are named third-person; wall-clock faster than the single-call version with visible phase progress; release gate green.

Open questions (for design): profile call stays batched (diversity) — confirm; evidence stays LLM-generated vs assembled from interview signals (research has quotes; strategy has none) — deferred; partial-batch semantics on backstory failure — decided: fail loudly.

Update (2026-08-08, mid-implementation): the evidence question is resolved — strategy personas get FULL research parity (valueEvidence, fearEvidence, evidenceLinks, bestFor/lessReliableFor, identityContext/situationContext, per-attribute provenance with computed overallConfidence), but grounded in the user's questionnaire/free response (the persona description), not interview transcripts. Evidence is LLM-generated from the description. Research stays interview-grounded.

# persona-evidence-integrity

Status: accepted (2026-08-10, design approved)

Decision: Strategy evidence becomes verbatim-or-honest with LLM-decided confidence. Evidence quotes must be verbatim fragments of the user's response (quoted, sourced "your response"), never fabricated persona-voice quotes; absent quotes are honest (attribute stays interpreted). Confidence per attribute (values/fears/goals/backstory/dims) is decided by the LLM in a profile-time `attributeConfidence` list, not hardcoded bands. Enforced client-side (verbatim substring + coverage + distinct checks) with failure-specific retry nudges, 3 attempts, fail-loud.

Reason: the deployed output fabricated first-person "evidence" the user never said — an integrity problem, not cosmetic. Hardcoded confidence bands repeated the "blanket 0.7" issue the user already rejected.

Failure mode to watch: a terse input can't support verbatim quotes for every attribute — the design accepts omission (empty quote) so the run doesn't retry-loop or fail on honest gaps; coverage nudge handles LLM omission.

Update (2026-10-07): the fail-loud half of the enforcement is dropped. A quote that survives `snapQuotesToSource` is now kept and listed in a `[PersonaAdapter]` warning instead of throwing, because a near-miss quote is worth more to the reader than a failed batch, and restarting a whole run over wording is a worse outcome than the wording. The verbatim rule no longer retries and no longer has a retry nudge; `required`, `distinct` and `coverage` still retry and can still fail the batch. Consequence to keep in mind: a stored quote is no longer guaranteed to be a fragment of the source, so any surface that highlights a quote inside its transcript must tolerate a miss.

# persona-terse-description-brief

Status: accepted (2026-09-28)

Decision: The strategy pipeline expands a terse description into a brief before the profile call, and repairs a paraphrased quote to the source sentence it paraphrases instead of spending a retry on it.

(a) Gate: under 150 characters with no blank-line sections, `generateStrategyPersonas` spends one extra `createChatCompletion` ("Strategy brief expansion") on the default text model — not the pinned strategy snapshot, since the brief has no verbatim contract of its own — and prepends the elaboration to the user's own words, so the profile prompt and its verbatim source text are both that superset. Long descriptions, and short-but-structured (`Label:`-prefixed) ones, skip the call: `evidenceQuestionsFor` maps quotes to those labels, and an expanded copy would detach them. A failed brief call degrades to the description as-is; it never fails the run.

(b) `snapQuotesToSource` runs before every check that consumes a quote. Each non-verbatim quote is matched against the source's sentences (longest common subsequence of punctuation-stripped, lowercased tokens — order-sensitive) and replaced by that sentence when ≥70% of the quote's tokens appear in it; quotes under 4 tokens are never snapped. A quote with no close sentence is left untouched and kept, flagged in a warning (see the 2026-10-07 update on persona-evidence-integrity).

Context: one-line ICPs did not merely lose quotes, they failed outright. v4.1 fabricated quotes, then dropped `evidenceLinks` once nudged (3/3, twice); the pinned v4-flash-0731 died the same way in the VPS run (3/3 after 150s with "B2B SaaS founders dealing with high churn and seat-based pricing"). Copy fidelity then turned out to be stochastic and length-dependent: the same prompt produced exact fragments on one attempt and a stitched near-copy on the next ("hear churn complaints" → "hears churn complaints"), so adding material alone still left a 150s failure likely enough to land on the first production run. A near-copy is the same content with a different inflection, not fabrication — rejecting it bought nothing the user could see.

Alternatives: relax the verbatim rule for short inputs (rejected — drops the integrity invariant); more attempts (rejected — probabilistic, 30-60s per attempt, and it was already 3); require longer input in the UI (rejected — pushes the problem onto the user); drop non-verbatim quotes as honest omission (rejected — discards evidence that is recoverable from the source by construction); have the model select evidence by index from prepared atoms (deferred — strongest guarantee, but changes the profile schema).

Reason: the contract is about where the stored text comes from, not about the model's typing accuracy. Repaired and expanded values are both word-for-word fragments of the source text in the prompt; a quote that no repair can reach is kept and warned about rather than failing the batch.

Failure mode to watch: quotes may now come from the generated elaboration, which the user never saw (single-section input still renders no "(Answer to …)" label, so nothing claims otherwise). Snapping can land two fields on one sentence — the distinct check runs after the repair for that reason. Surface the brief in the UI if provenance matters for a demo.

Verification: adapter tests cover expand / skip-when-long / skip-when-structured / fail-open, repair-instead-of-retry, and keep-and-warn-on-non-verbatim; `verify-output persona --description "<one-liner>" --count 3` now passes the profile batch on attempt 1 (101s wall, brief call 1.8s) where it previously failed 3/3 at 150s, with 4-6 evidence links per persona and distinct values/fears; release gate green.

# persona-batch-ownership

Status: accepted (2026-10-08)

Decision: A settled persona run becomes a batch through one function, `persistPersonaBatchForRun` (`src/lib/personaRunOutcome.ts`), called by every observation site. `PersonaBatch.runId` records which run produced the batch, and that field is what makes the write idempotent: an observer that finds a batch already carrying the run id writes nothing and gets `null` back.

Context: batch creation had drifted into `PersonaProgressToaster`, a notification component. It polls every active run, so it is the observer that survives the user navigating away from the page that started the run — but it was also building the `PersonaBatch` entity, and the two hooks built their own copies at four more sites (a stream path and a poll path each). Five sites constructing one entity, arbitrated by a module-level `Set` exported to all of them (`batchConsumedRunIds`), meant naming had to be wired five times (it was, in this session) and the shape five times.

Alternatives:
- **Store owns the claim** (`claimRun(runId): boolean` beside `activeGenerationRunIds`): keeps the atomic claim, but adds a second piece of run state to persist and keep in sync with the batch list, when the batch itself can answer the question.
- **Keep the never-cleared `Set`** (status quo): invisible in the persisted data, forgotten on reload, and duplicated at each call site.
- **Toaster stops creating batches; only the starting hook does**: removes coordination but breaks the case the toaster exists for — the hook unmounts when the user navigates away, and the run's personas would never reach the list.
- **Server owns the run registry** (the VPS result store already holds personas by runId): the structural fix, but it moves client-persisted batch data behind an API the dashboard reads from IndexedDB today. Deferred, not rejected.

Reason: the invariant was "a run settles into exactly one batch, whatever page the user is on". That is a property of the data, so it lives on the data (`runId`), not in a `Set` shared between five callers. The claim is still taken synchronously before the naming call, so two observers that resolve in the same second pay for one title rather than two.

Failure mode to watch: `persistPersonaBatchForRun` returns `null` when another observer owns the run, and callers must not read that as "no personas". `usePersonaFlow` now remembers a batch id only when it wrote the batch; the old code remembered the id of a locally built batch that had lost the race, so `DashboardClient` would navigate to a batch that does not exist. Covered by test, not observed live.

Verification: `src/lib/__tests__/personaRunOutcome.test.ts` covers fallback naming, model naming, two observers settling concurrently (one batch, one naming call, one non-null return), a late second observer, a caller with no run id, and failure records. Release gate green (546 tests, build clean). No live generation was run for this refactor; the hooks' existing tests exercise the wiring end to end.
