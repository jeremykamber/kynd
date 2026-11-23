# Analyses list

A user opens the analyses dashboard to see whether they have any runs and to open a completed one.

## Sub-features

- Empty state for a fresh user.
- Completed analysis row with name and status.
- Header summary of completed and in-progress runs.
- Navigation into the report.

## How to get to it (user POV)

1. Open `/dashboard/analyses`.
2. A fresh browser shows `No analyses yet`.
3. A browser with a completed run shows its name and `1 completed · 0 in progress`.

## Driving it with Playwright

1. Run `bunx vitest run test/artifact-analysis-detail.spec.ts`.
2. The spec starts or reuses a dev server and drives Chromium.
3. The first test opens `/dashboard/analyses` with no seeded store and asserts exactly one `No analyses yet`.
4. The second test seeds `analysis-storage` and asserts the run name and `1 completed · 0 in progress`.

**End state:** the empty state appears once for a fresh user, and the completed row opens the report.

## Gotchas

- The empty-state message must appear exactly once. The header subtitle must not duplicate it.
- The spec starts its own server through `test/helpers/server.ts`; set `E2E_PORTS` in automated runs so it owns the port.
- The list reads IndexedDB. A test that skips the seed can still see a previous browser profile, so use a fresh context.
