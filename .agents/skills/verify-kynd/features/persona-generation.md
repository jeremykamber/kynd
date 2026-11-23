# Persona generation

A user describes an audience and Kynd generates synthetic personas with backstories, traits, and decision styles.

## Sub-features

- Strategy mode: one fast generation call.
- Legacy mode: the app's multi-call pipeline.
- Distinct names, roles, and psychographics.
- Five Big Five traits in range.

## How to get to it (user POV)

1. Open the dashboard.
2. Start persona generation with an audience description.
3. Review the personas before running an analysis.

The CLI harness reaches the same pipeline without the browser.

## Driving it with the live CLI

1. Run `bun scripts/verify-output.ts persona --description "B2B SaaS founders dealing with high churn" --count 3`.
2. The script checks the count, distinct names, required fields, and Big Five ranges.
3. It saves the raw personas under `.sisyphus/verify/`.
4. Read the saved JSON and judge distinctness, audience fidelity, backstory, and psychographics. The script does not judge semantics.

**End state:** three personas with distinct names, complete fields, and coherent traits. Every PASS in stdout is structural; the semantic verdict is yours.

## Gotchas

- Real LLM calls cost money. Use a count of three for a quick check.
- `.env` must contain `OPENROUTER_API_KEY`.
- `--mode legacy` runs the slower multi-call pipeline. It takes three to five minutes.
- A structural PASS does not prove distinctness. Read the personas.
