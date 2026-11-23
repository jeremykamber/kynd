# Artifact analysis

A user gives Kynd a text brief, a URL, or a screenshot, and the simulated personas read it and produce a report.

## Sub-features

- Text input for a brief, feature list, landing copy, pitch deck text, or script.
- URL and screenshot intake.
- One to five journey stages per persona, ending at the stop.
- Cohort synthesis with grounded findings, disagreements, and citations.
- Report rendering, which is the analysis-report entry.

## How to get to it (user POV)

1. Start a new analysis.
2. Choose text, URL, or screenshot input.
3. Select personas and run the analysis.
4. Open the completed run.

The CLI reaches the generation pipeline directly. The browser drive reaches the finished report with a fixture.

## Driving it with the live CLI

1. Run `bun scripts/verify-output.ts artifact --text .sisyphus/verify/inputs/relay-feature-brief.md --description "B2B SaaS founders and support leads" --count 3 --business-goal "Decide whether to launch." --research-question "Would this brief convince a small team?"`.
2. The script generates personas, analyzes the text, synthesizes the cohort, and checks structure.
3. It saves the raw artifact under `.sisyphus/verify/`.
4. Read the JSON. Check that each journey is an ordered prefix ending blocked or stopped, the answer names the cohort not an individual, and citations are verbatim.

**End state:** every response has one to five ordered stages, a terminal stop when shorter than five, a direct research answer, and a synthesis with findings and citations.

## Gotchas

- The CLI does not render the report. Run `scripts/verify-app.ts` after it for the page.
- Use `--text` for a document. `--url` needs `PLAYWRIGHT_WS_ENDPOINT` for browser intake.
- The full run takes minutes. A three-persona text run is the shortest useful check.
- A failed persona is valid with one stopped stage. Do not expect five stages on every response.
- Read the saved JSON. The stdout report is structural and does not judge groundedness.
