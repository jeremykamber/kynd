# Kynd feature map

Operational index for the features this drive covers. Read the row for the change, then follow the feature file for the exact harness and end state.

| Feature | Reach it by | Harness | Proves | File |
| --- | --- | --- | --- | --- |
| Analysis report | Complete an analysis, open Analyses, select the run | Playwright: `E2E_PORTS=3214 bun scripts/verify-app.ts` | The answer, findings, sparse journey, and chat render on the real page | [analysis-report.md](analysis-report.md) |
| Analyses list | Open `/dashboard/analyses` | Vitest + Playwright: `bunx vitest run test/artifact-analysis-detail.spec.ts` | Empty state, completed row, and status summary | [analyses-list.md](analyses-list.md) |
| Persona generation | Start persona generation from the dashboard | Live LLM CLI: `bun scripts/verify-output.ts persona` | Three distinct personas with complete, coherent fields | [persona-generation.md](persona-generation.md) |
| Artifact analysis | Analyze a text brief, URL, or screenshot | Live LLM CLI: `bun scripts/verify-output.ts artifact` | Valid journeys, grounded findings, synthesis, and citations | [artifact-analysis.md](artifact-analysis.md) |

The browser drive is the primary proof for the report page. The live CLI proves model output. A release runs both.
