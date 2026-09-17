# Contributing to Kynd

Thanks for helping. This document is the workflow contract: how to set up, what to run before
you push, and the conventions the codebase follows. If something here contradicts the code,
the code wins — please fix the doc in the same PR.

## Setup

```bash
git clone git@github.com:jeremykamber/kynd.git
cd kynd
bun install
cp .env.example .env      # fill in OPENROUTER_API_KEY
bun dev                   # http://localhost:3000
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before your first change — the layer boundaries are
enforced by review, not by tooling.

### Working in a worktree

For parallel work, create a git worktree and run the setup script. Turbopack rejects
`node_modules` symlinks that point outside the worktree, so each worktree needs its own install:

```bash
git worktree add .worktrees/<name> -b <branch>
./scripts/setup-worktree.sh .worktrees/<name>
```

## The change workflow

1. **Branch from `dev`.** `dev` is the integration branch; `main` is release. Name branches by
   intent: `feat/…`, `fix/…`, `docs/…`, `refactor/…`.
2. **Make the smallest coherent change.** No unrelated cleanup, no speculative abstractions.
   See the root `AGENTS.md` principles: complexity is the enemy, modules should be deep, and
   duplication beats the wrong abstraction.
3. **Update the tests the change invalidates.** Tests are part of the change, not a follow-up.
   A test that passes by luck is worse than no test.
4. **Run the gate:** `bun run release` — production build (typecheck) plus the deterministic
   test subset. It must be green.
5. **Open a PR into `dev`.** CI runs `bun run build` and `bun run test` on every PR
   (`.github/workflows/ci.yml`).

### Test expectations

| Change | What to update |
| --- | --- |
| UI, routing, nav, visible copy | The browser specs in `test/*.spec.ts`. |
| LLM output schemas, prompt structures, use-case contracts | The covering tests in `src/**/__tests__/` and `test/*.test.ts`. |
| Removed features | Delete their tests. No dead tests. |

Write tests against observable behavior at public boundaries. Do not assert on call sequences,
mocked internals, or source text — those tests break on correct refactors and create false
confidence. If a test breaks when you refactor correctly, it was testing the wrong thing.

If you changed any prompt, the persona pipeline, or the artifact analysis pipeline, run the
`verify-kynd` skill (or `bun scripts/verify-output.ts`) before declaring done. It executes the
real pipeline and judges the raw output against the persona schema and pipeline invariants.

## Conventions

### Naming

| Element | Convention | Example |
| --- | --- | --- |
| Domain / application / infrastructure files | `PascalCase` | `GeneratePersonasUseCase.ts`, `LlmServicePort.ts` |
| Routes and shadcn primitives | `kebab-case` | `page.tsx`, `route.ts`, `button.tsx` |
| Utils, hooks, stores | `camelCase` | `useAnalysisFlow.ts`, `personaStore.ts` |
| Tests | source name + `.test.ts`, in a sibling `__tests__/` | `Persona.test.ts` |
| Classes / interfaces / types | `PascalCase`, no `I` prefix | `LlmServiceImpl`, `Persona` |
| Constants | `UPPER_SNAKE_CASE` | `OPENROUTER_API_KEY` |
| Booleans | `is` / `has` prefix | `isPending` |

Two older ports still carry an `I` prefix (`IMemoryServicePort`, `IDebateServicePort`); new ports omit
it.

### Imports

Cross-layer imports use the `@/` alias (configured in `tsconfig.json`). Sibling files — including a
spec reaching the shared helper in a parent `__tests__/` — use relative paths:

```typescript
import { Persona } from "@/domain/entities/Persona";
import { mockPersona } from "../../__tests__/test-utils";
```

### Layering

Dependencies point **inward**: `domain` ← `application` ← `infrastructure`, `actions` ← `ui`.
Business logic never lives in UI, actions, or adapters. A full description of each layer, the
real ports, and the data flows is in [`ARCHITECTURE.md`](ARCHITECTURE.md) — this document does
not restate it.

### Error handling

- Return typed results from actions and use cases; don't throw raw strings across boundaries.
- Never leave an empty `catch` — log it, re-throw it, or handle it.
- Retry transient LLM failures (429, 5xx) through the existing `withRetry()` helper.
- `AnalysisLogger` (`src/infrastructure/AnalysisLogger.ts`) writes structured per-run JSONL to
  `logs/analysis/` for the long-running pipelines. Use it there rather than `console.log`.

Log prefixes are `[ModuleName]`, optionally with a request id and purpose:
`[LlmService] [Req #42] [retry] …`.

### Scaffolding

`bunx plop` generates entities, ports, use cases, adapters, stores, and components from
`src/templates/`. Prefer it over hand-creating files so the structure stays uniform.

## Backend changes

The VPS backend is `src/app/api/vps/*` plus `playwright-server.js` — the routes that run multi-minute
LLM pipelines or drive a browser. `src/app/api/report/route.ts` is *not* one of them: it is a public
Next.js route deployed with the rest of the app on Netlify. After merging a change to the VPS backend:

```bash
# on the VPS, in the repo checkout
git pull origin dev
bun run build
npx pm2 restart ecosystem.config.js
```

Netlify deploys the frontend and server actions automatically. Full details — env vars, PM2
process names, auth flow — are in [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md).
