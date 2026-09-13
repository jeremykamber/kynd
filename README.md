<p align="center">
  <img src="public/kynd_logo.svg" alt="Kynd" width="96" />
</p>

<h1 align="center">Kynd</h1>

<p align="center">
  <strong>AI-powered user testing.</strong><br />
  Generate high-fidelity synthetic personas, run them against your product, and get a
  structured behavioral report — without recruiting a single participant.
</p>

---

## What Kynd does

Kynd replaces the expensive part of user research — recruiting and scheduling — with simulated
participants that stay grounded in evidence.

**Personas** come from one of two front doors:

- **Audience description** — describe a target market in a sentence or two.
- **Interview transcripts** — upload real interviews. Kynd extracts only what participants
  actually said, pools those signals across the cohort, samples personas from the resulting
  distribution, and keeps a traceable line from every persona back to source evidence.

**Artifact analysis** is what you run those personas through. Given a URL (or an uploaded
screenshot) and a research question, Kynd opens the page in a real browser, captures it, and
has each persona walk through the artifact across five cognitive stages. Personas can then be
interviewed directly in chat, with retrieval grounding their answers.

The output is a per-persona [`PersonaResponse`](src/domain/entities/PersonaResponse.ts) plus a
cohort synthesis: friction, unanswered questions, and major findings, with citations.

Further reading: [`docs/TRANSCRIPT_ANALYSIS_MANIFESTO.md`](docs/TRANSCRIPT_ANALYSIS_MANIFESTO.md)
is the plain-English explanation of why the persona pipeline works the way it does.

## Quick start

### Prerequisites

- **[Bun](https://bun.sh)** — runtime and package manager.
- **Chromium** (optional, for running the analysis pipeline locally):
  `bunx playwright install chromium`

### 1. Install

```bash
bun install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in at minimum `OPENROUTER_API_KEY`. See
[Environment variables](#environment-variables) for the rest.

### 3. Run

```bash
bun dev
```

Open <http://localhost:3000> for the marketing site, or <http://localhost:3000/dashboard> for
the app.

> **Where does the pipeline actually run?** Every server action calls `shouldRunLocally()`
> (`src/infrastructure/config.ts`). It returns `false` unless `FORCE_LOCAL=true`, so by default
> actions POST to a **remote backend** at `VPS_BACKEND_URL`. To run everything in-process
> (including browser automation) on your machine:
>
> ```bash
> # terminal 1 — exposes Chromium over WebSocket on :8081
> node playwright-server.js
>
> # terminal 2 — .env: FORCE_LOCAL=true, PLAYWRIGHT_WS_ENDPOINT=ws://localhost:8081/playwright-ws
> bun dev
> ```
>
> This split is explained in depth in [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md).

## Environment variables

All variables live in `.env` (git-ignored); `.env.example` is the committed template.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes | — | LLM access. `OPENAI_API_KEY` is accepted as a fallback. |
| `OPENAI_API_KEY` | No | — | Fallback LLM key when `OPENROUTER_API_KEY` is unset. |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | OpenAI-compatible gateway URL. |
| `OPENROUTER_MODEL` | No | `deepseek/deepseek-v4-flash` | Default text/vision model. |
| `OPENROUTER_CHAT_MODEL` | No | `OPENROUTER_MODEL` | Model used for persona chat. |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434/v1` | Local model endpoint (`provider = "ollama"`). |
| `OLLAMA_API_KEY` | No | `ollama` | Auth for the local model endpoint. |
| `FORCE_LOCAL` | No | unset | `true` runs use cases in-process instead of delegating to the VPS. |
| `PLAYWRIGHT_WS_ENDPOINT` | Local runs | — | WebSocket endpoint of the browser server. Throws if missing when the browser is used in-process. |
| `VPS_BACKEND_URL` | VPS mode | `http://localhost:8080` | Backend the server actions delegate to. |
| `VPS_AUTH_TOKEN` | VPS mode | — | Bearer token expected by `/api/vps/*`. |
| `IS_VPS` | VPS host | unset | `true` enables `/api/vps/*`; any other value makes those routes return 404. |
| `LOG_DIR` | No | `cwd` | Root for per-run analysis logs (`$LOG_DIR/logs/analysis/`). |
| `PERSONA_TOKEN_LIMIT` | No | `2000` | Output token budget per persona response. |
| `AUDIT_RATE_LIMIT_MAX` | No | `5` | Requests allowed per rate-limit window, per IP. |
| `AUDIT_RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window length. |
| `PLAYWRIGHT_PORT` | No | `8081` | Port used by `playwright-server.js`. |
| `PLAYWRIGHT_WS_PATH` | No | `playwright-ws` | WebSocket path used by `playwright-server.js`. |

## Commands

| Command | What it does |
| --- | --- |
| `bun dev` | Start the Next.js dev server. |
| `bun run build` | Production build (`next build`). |
| `bun start` | Serve a production build. |
| `bun lint` | ESLint (flat config). |
| `bun test` | Full Vitest suite — unit, integration, and browser specs. |
| `bun run release` | **The gate.** Production build + the deterministic test subset. Run before pushing. |
| `bun run benchmark` | Persona/analysis benchmark harness. |
| `./autoresearch.sh` | Fixed-workload wall-clock benchmark for the artifact pipeline. |
| `bunx plop` | Scaffold a new entity, port, use case, adapter, store, or component. |
| `node playwright-server.js` | Local Playwright browser server for in-process runs. |

## Testing

Tests live in two places, both run by `bun test` (Vitest, jsdom):

| Location | Kind | Notes |
| --- | --- | --- |
| `src/**/__tests__/*.test.ts` | Unit / integration | Co-located with the code they cover. |
| `test/*.test.ts`, `test/*.spec.ts` | Cross-layer and browser E2E | Specs spawn `next dev`, so the suite runs files serially (see `vitest.config.ts`). |

`bun run release` runs `vitest.release.config.ts`, which excludes the non-deterministic files
listed in that config. Keep that list empty unless something is genuinely broken.

New to the browser specs? [`docs/E2E_TEST_GUIDE.md`](docs/E2E_TEST_GUIDE.md) covers the
server-management and seeding patterns.

## Repository layout

```
src/
├── domain/          # Entities, ports, DTOs — pure TypeScript, zero framework deps
├── application/     # Use cases + interview pipeline + synthesis (pure orchestration)
├── infrastructure/  # Adapters implementing ports: LLM, browser, RAG, storage, logging
├── actions/         # "use server" entry points — instantiate deps, call a use case
├── app/             # Next.js App Router: (marketing), (app)/dashboard, api/{chat,report,vps}
├── ui/              # Feature UI: dashboard views, hooks, Zustand stores
├── components/      # Shared UI: shadcn primitives (ui/) and domain components (custom/)
├── templates/       # Plop generator templates
└── data/, lib/, hooks/, types.ts

test/       # Browser specs and cross-layer integration tests
scripts/    # Benchmarking and output-verification tooling
docs/       # Subsystem deep dives (see below)
public/     # Static assets
```

Dependency direction is strict and inward: `domain` ← `application` ← `infrastructure` /
`actions` ← `ui` / `app`. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full ruleset.

## Documentation

| Document | Read it when |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | You are about to make a change and need the layering rules, real use cases, ports, and data flows. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | You are about to open a PR: branching, tests, conventions, deploy. |
| [`docs/ARTIFACT_ANALYSIS_FLOW.md`](docs/ARTIFACT_ANALYSIS_FLOW.md) | You are working on the artifact/pricing analysis pipeline. |
| [`docs/INTERVIEW_TO_PERSONA_PIPELINE.md`](docs/INTERVIEW_TO_PERSONA_PIPELINE.md) | You are working on the interview→persona pipeline (includes the domain glossary). |
| [`docs/PERSONA_INFERENCE_SYSTEM.md`](docs/PERSONA_INFERENCE_SYSTEM.md) | You want the research basis behind the persona prompts. |
| [`docs/PERSONA_MODELING_PHILOSOPHY.md`](docs/PERSONA_MODELING_PHILOSOPHY.md) | You are changing how personas are generated, or what evidence they may invent. |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | You want the full literature review behind the technique choices. |
| [`docs/USE_CASE_TRACES.md`](docs/USE_CASE_TRACES.md) | You want a call-by-call trace of the three main flows. |
| [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md) | You are deploying, or debugging Netlify↔VPS routing and auth. |
| [`docs/E2E_TEST_GUIDE.md`](docs/E2E_TEST_GUIDE.md) | You are writing or debugging a browser test. |
| [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) | You are shipping to an external audience. |
| [`docs/REPORT_API.md`](docs/REPORT_API.md) | You are integrating with the programmatic `POST /api/report` endpoint. |
| [`DESIGN.md`](DESIGN.md) / [`PRODUCT.md`](PRODUCT.md) | You are touching UI or product copy. |

## Deployment

Kynd runs in two places:

- **Netlify** hosts the frontend and the server actions.
- **A VPS** hosts the long-running `/api/vps/*` routes and a Playwright browser server, because
  serverless functions cannot block on 60–120s LLM pipelines.

The two are wired together by `VPS_BACKEND_URL` + `VPS_AUTH_TOKEN`. Full setup, PM2 process
management, and the common "Unauthorized" failure modes are documented in
[`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: branch from `dev`, keep `bun run release`
green, and update the tests that your change invalidates.
