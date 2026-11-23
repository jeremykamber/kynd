---
name: verify-kynd
description: Drives Kynd's completed report in a real browser and runs its live output pipelines (persona generation, artifact analysis). Use whenever you change the report UI, prompts, the persona pipeline, the artifact analysis pipeline, or any LLM output structure, and before demoing or shipping.
---

# verify-kynd

Drive the report in a browser, run the live pipeline, and judge the output against the requirements. Replaces the manual "run an analysis → copy the JSON → paste it into an AI → ask for a take" loop.

**Division of labor:** the browser drive proves what the user sees. The pipeline script checks structure (counts, required fields, stage order). You check semantics: whether the output actually satisfies the requirements. The script is a harness; you are the judge; the user is the final reviewer.

## Start with the feature map

`features/README.md` is the index of user-facing features, the harness for each, and the end state that proves it. Read the row for the change before choosing a command. The map keeps the drive from testing only the path that happened to be top of mind.

## Browser drive (primary for the report page)

For any change to the analysis report, drive the real page first:

```bash
E2E_PORTS=3214 bun scripts/verify-app.ts
```

The drive launches the app, seeds a completed analysis in IndexedDB, opens the report in Chromium, expands a sparse journey, asserts `Blocked at understanding` and three `Not reached` rows, and writes:

- `.ai/threads/verify-app/after-top.png`
- `.ai/threads/verify-app/after-journey.png`
- `.ai/threads/verify-app/after-desktop.webm`

It covers the five parts: launch (`test/helpers/server.ts`), doctor (visible-text assertions and no page errors), drive (click the persona), evidence (two screenshots and a video), cleanup (close the browser and kill the server).

The report feature file has the step-by-step drive and the gotchas: `features/analysis-report.md`.

## Live output pipeline

The CLI proves the model output; it does not prove the page renders. Run it for prompt or schema changes, then run the browser drive for the page.

## Setup

- `.env` must exist with `OPENROUTER_API_KEY`
- `PLAYWRIGHT_WS_ENDPOINT` needed only for `--url` artifact runs (browser intake)
- Runs real LLM calls — real cost, takes minutes. Use small counts for quick checks.

## Usage

```bash
# Generate personas and verify structure (default: fast single-call strategy mode)
bun scripts/verify-output.ts persona --description "B2B SaaS founders dealing with high churn" --count 3

# Same, but run the app's default multi-call pipeline (slower, 3-5 min)
bun scripts/verify-output.ts persona --description "..." --count 3 --mode legacy

# Run an artifact analysis (URL) — generates personas inline first
bun scripts/verify-output.ts artifact --url https://example.com/pricing --description "B2B SaaS founders" --count 3

# Artifact analysis with existing personas
bun scripts/verify-output.ts artifact --url https://example.com/pricing --personas-file ./personas.json

# Artifact analysis from a screenshot (no browser needed)
bun scripts/verify-output.ts artifact --image ./screenshot.png --description "..." --count 3

# Custom output path
bun scripts/verify-output.ts persona --description "..." --count 3 --out /tmp/personas.json
```

Output:

- **stdout:** structural check report (PASS/FAIL lines) + the saved file path
- **file:** full raw JSON at `.sisyphus/verify/<timestamp>-<mode>.json` — the evidence

## Protocol

1. Run the script for the mode you changed (persona, artifact, or both).
2. `read` the saved JSON file — the stdout report is not enough.
3. Judge against the rubric below. Quote evidence from the JSON for every PASS/FAIL.
4. Report a verdict table, then if anything FAILs, describe the fix and offer to apply it.
5. Remind the user to spot-check before shipping (release checklist Step 2).

## Persona rubric

For each persona, judge:

1. **Audience fidelity** — does the persona actually reflect the requested description (demographics, pains, context)? Do NOT let generic "AI person" personas pass.
2. **Distinctness** — each persona is a clearly different individual: vary age/career stage, emphasized pain points, values, fears, skepticism, communication and decision style. Two personas must not share the same values/fears/communication style. Flag near-clones.
3. **Big Five** — all five traits present, 0–100, and *internally coherent* (a high conscientiousness persona shouldn't read chaotic).
4. **Psychographics** — values and fears present, grounded in the evidence/description (not generic lists like "success", "security"). If `valueEvidence`/`fearEvidence` exist, they must support the value/fear.
5. **Backstory** — rich narrative (6–10 paragraphs per the generation prompt), causally coherent, grounded in the source material, no fabricated trauma/specific life events (research/interview modes).
6. **Guardrails** — epistemic boundaries, refusal patterns, response constraints present where expected.
7. **Language** — all fields in English even if source material is another language.
8. **Count** — matches the requested count.

## Artifact analysis rubric

For each persona response, judge:

1. **Journey shape** — one to five stages, a prefix of `interpretation → understanding → belief → motivation → action`, in order. A shorter journey must end `blocked` or `stopped`; a persona that completed the journey has all five stages. A failed persona has one `stopped` stage. The report projects omitted stages as "Not reached".
2. **Stage descriptions** — what the persona *thought/felt* at that stage, NOT what they saw on the page. Flag descriptions that are just observations ("the page has a blue button") without cognition.
3. **Sentiment/outcome/transition** — present and coherent per stage.
4. **Groundedness** — findings and frictions reference the actual artifact content (specific claims, sections, wording), not generic critique that would apply to any page.
5. **Research question answer** — directly answers the research question from this persona's experience.

For the synthesis, judge:

1. **No persona names** — must say "Most personas" / "Several personas", never individual names.
2. **No recommendations** — describes what was observed, not what the user should do.
3. **No trait causality** — persona attributes may contextualize but not explain behavior.
4. **Confidence** — derived from agreement (ratio of affected/total personas), not asserted by the LLM.
5. **Completeness** — findings, disagreements, frictions present and non-generic; failed count reported.

## Report format

```markdown
## Verify: persona (3 personas)

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Audience fidelity | PASS | "…" (quote) |
| 2 | Distinctness | FAIL | persona A and B share values ["Transparency"] and style "direct" |

**Summary:** 7/8 pass. FAIL: distinctness (personas 2 and 3 are near-clones).
**Fix:** adjust the diversity requirement in the prompt / regenerate with more contrast.
```

## Reference

- Pipeline invariants & five stages: `docs/ARTIFACT_ANALYSIS_FLOW.md`
- Persona schema & generation: `src/domain/entities/Persona.ts`, `docs/PERSONA_INFERENCE_SYSTEM.md`
- Interview-to-persona pipeline: `docs/INTERVIEW_TO_PERSONA_PIPELINE.md`
- Product context: `PRODUCT.md`
