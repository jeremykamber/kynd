# Analysis report

A user opens a completed artifact analysis and reads the cohort answer, the findings, each persona's journey, and can ask the whole audience.

## Sub-features

- Cohort answer from the synthesis model.
- Top findings, disagreements, and friction points.
- Per-persona reports with the sparse journey projection.
- Ask the whole audience panel chat.
- Download PDF report.

## How to get to it (user POV)

1. Complete an analysis from the dashboard.
2. Open `Analyses` and select the run.
3. Expand a persona row to see the journey.

The browser drive seeds a completed run in IndexedDB, so it runs without an LLM call and without creating an analysis.

## Driving it with Playwright

1. From the repo root, run `E2E_PORTS=3214 bun scripts/verify-app.ts`.
2. The drive starts `next dev` through `test/helpers/server.ts`, seeds `analysis-storage`, and opens `/dashboard/analyses/verify-app-run`.
3. It waits for `2 of 2 personas completed`, `The answer`, `Ask the whole audience`, and `Individual persona reports`.
4. It clicks `Marcus Lee` and asserts `Blocked at understanding`, exactly three `Not reached` rows, and `Could not find SSO pricing.`
5. It asserts there are no page errors, then writes the evidence.

**End state:** the collapsed row names the stop, the expanded journey shows interpretation and understanding, the stop at understanding, and not-reached rows for belief, motivation, and action.

Evidence:

- `.ai/threads/verify-app/after-top.png`
- `.ai/threads/verify-app/after-journey.png`
- `.ai/threads/verify-app/after-desktop.webm`

The wider report flows run with `bunx vitest run test/artifact-analysis-detail.spec.ts`: empty list, completed list, panel chat, expanded persona, and mobile viewport.

## Gotchas

- Use `bunx vitest run`, not `bunx playwright test`. The spec imports Vitest and Playwright; the Playwright runner fails with `Vitest cannot be imported in a CommonJS module`.
- A full-page screenshot paints fixed UI at the viewport position, so the nav, dev badge, or floating action can appear mid-page. The drive uses viewport screenshots.
- Hide `nextjs-portal` before capturing evidence; it is the Next.js dev badge, not product UI.
- The drive uses a fixture. It does not create an analysis or call the model. Use the artifact-analysis entry for live generation.
- Set `E2E_PORTS` so the helper owns its server and cannot reuse a stale dev server from another worktree.
