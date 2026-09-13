# Kynd Architecture

Kynd is an AI user-testing tool. It builds **personas** (from a market description or from real
interview transcripts), then runs those personas against an **artifact** — a live URL or a
screenshot — and produces a structured behavioral report.

This document is the map: the layers, the dependency rules, the real ports and use cases, and
where each flow lives. Subsystem deep dives are linked at the bottom; they are the authority on
their own flow, and this document does not restate their internals.

## Read this first: the system runs in two places

Kynd is deliberately split, and the split explains most of the codebase's shape:

```
┌──────────────────────────────┐        ┌────────────────────────────────────────┐
│ Netlify                      │        │ VPS (PM2)                              │
│  • UI + server actions       │  HTTP  │  • Next.js standalone, /api/vps/*      │
│    (src/actions)             │ ─────▶ │  • playwright-server.js (Chromium WS)  │
│  • 10–15 s function limit    │        │  • 60–120 s pipelines, fire-and-forget │
└──────────────────────────────┘        └────────────────────────────────────────┘
```

Long-running work (multi-call LLM pipelines, browser automation) cannot run inside a serverless
function, so those routes live on the VPS and are polled. `src/infrastructure/config.ts` decides
which side executes: `shouldRunLocally()` returns `false` unless `FORCE_LOCAL=true`, so by default
every server action delegates through `runRemote()` to `POST $VPS_BACKEND_URL/api/vps/<endpoint>`.

`src/middleware.ts` guards `/api/vps/:path*`: it returns 404 unless `IS_VPS=true`, then requires
`Authorization: Bearer $VPS_AUTH_TOKEN`. If you are debugging an "Unauthorized", start there.
See [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md).

## Layering

Dependencies point **inward**. Outer layers know about inner ones; never the reverse.

```
ui / app          React pages, feature components, hooks, Zustand stores
   │
actions           "use server" entry points: build deps, call one use case
   │
application       Use cases + interview pipeline + synthesis (pure orchestration)
   │
domain            Entities, ports, DTOs — pure TypeScript, no framework imports
   ▲
infrastructure    Adapters implementing ports (LLM, browser, RAG, storage, logging)
```

| Layer | May import | Must not |
| --- | --- | --- |
| `domain` | Nothing (pure TS) | React, Next, Zustand, any SDK |
| `application` | `domain` | `infrastructure`, React, Next |
| `infrastructure` | `domain`, application types | React, Next |
| `actions` | `application`, `infrastructure` | Business logic |
| `ui`, `app` | `actions`, `domain` shapes | `infrastructure` directly |

The `infrastructure → application` edge is type-only. A port's *implementation* lives in
`infrastructure`; the port itself is declared in `domain`.

## Directory map

```
src/
├── domain/
│   ├── entities/          # Business objects (+ Zod schemas where the LLM returns them)
│   ├── ports/             # Interfaces the application depends on
│   └── dtos/              # Data-transfer shapes across boundaries
├── application/
│   ├── usecases/          # One orchestrator per user-visible operation
│   ├── interviewPipeline/ # Transcript → signals → pooled distribution → sampled persona
│   └── synthesis/         # Cross-persona synthesis helpers (citations)
├── infrastructure/
│   ├── adapters/          # Port implementations: LLM, browser, RAG, chat, debate
│   ├── services/          # IndexedDB persistence
│   ├── mappers/           # Domain ↔ persistence row conversion
│   ├── config.ts          # Local-vs-VPS execution switch
│   ├── AnalysisLogger.ts  # Per-run JSONL logs → logs/analysis/
│   └── *Store.ts          # In-process result/progress/cancellation state
├── actions/               # "use server" functions
├── app/
│   ├── (marketing)/       # Public landing page
│   ├── (app)/dashboard/   # Authenticated app: new, interviews, analyses, debates, generating
│   └── api/               # chat, report, vps/*
├── ui/
│   ├── dashboard/         # Views, dashboard components, utils
│   ├── interviews/        # Upload client
│   ├── hooks/             # useAnalysisFlow, usePersonaFlow, useInterviewPipeline, useDebate
│   └── stores/            # Zustand: persona, analysis, debate, user
├── components/
│   ├── ui/                # shadcn/ui primitives
│   └── custom/            # Domain components (Persona*, Analysis*, Citation*, FlowDialog)
├── templates/             # Plop generator templates
└── data/, lib/, hooks/, types.ts
```

## Domain

### Entities (`src/domain/entities/`)

| Entity | Represents |
| --- | --- |
| `Persona` | A synthetic user: Big Five traits, psychographics, evidence provenance, backstory |
| `PersonaProvenance` / `BehavioralDimension` | Evidence tier per attribute; context-specific behavioral axes |
| `PersonaResponse` | One persona's complete analysis output (journey, findings, friction, questions) |
| `CognitiveStage` / `StageJourney` / `MajorFinding` | The five-stage journey and its findings |
| `ArtifactIntake` | Normalized input: screenshot + HTML + summary |
| `ArtifactAnalysis` | Container for one analysis run |
| `ArtifactSynthesis` | Cross-persona output: top findings, disagreements, friction |
| `PersonaProfile` | Presentation-layer snapshot used by reports and chat |
| `DebateRoom` | Multi-persona debate state |
| `InteractionStep` / `TestingSession` / `StreamOfConsciousness` | Step recording and think-aloud capture |
| `User` | Account |
| `PricingAnalysis` | **Legacy** pricing-specific entity — `@deprecated` in favour of `PersonaResponse` |
| `GazePoint` | Visual attention prediction |

`Persona` is the one entity whose schema is written for an LLM contract: it pairs the TypeScript
interface with a Zod schema so generated output can be validated.

### Ports (`src/domain/ports/`)

| Port | Contract |
| --- | --- |
| `LlmServicePort` | The application's single LLM façade: persona generation (three modes), artifact analysis, chat, interview signal extraction, rationalization, debate support |
| `BrowserServicePort` | Navigate, scroll, capture viewport, locate element, extract cleaned HTML |
| `IDebateServicePort` | Run a multi-round, multi-persona debate; yields streamed events |
| `IGazePredictionPort` | Predict gaze points on a screenshot for a persona |
| `IMemoryServicePort` | Summarize recorded interaction steps into a running context |
| `DatabaseServicePort` | Table-oriented CRUD over a client-side store |
| `UserRepositoryPort` | User CRUD |

`LlmServicePort` is intentionally large: it is a façade over an LLM provider, and callers should
not care which prompt or model backs a given operation. `LlmServiceImpl` owns the adapters and
delegates.

## Application

| Use case | Does |
| --- | --- |
| `AnalyzeArtifactUseCase` | Intake → per-persona analysis → response assembly |
| `synthesizeArtifactResults` (function) | Cohort synthesis across persona responses |
| `GeneratePersonasUseCase` | Generate personas from a description; dispatches research / strategy / cluster modes |
| `GeneratePersonasFromInterviewsUseCase` | Full interview pipeline: extract → pool → sample → generate → ID-RAG ingest |
| `ChatWithPersonaUseCase` / `ChatWithPanelUseCase` | Single-persona and cohort chat |
| `DebateUseCase` | Multi-round persona debate |
| `RecordStepUseCase` | Append an interaction step and refresh session memory |
| `RegisterUserUseCase`, `LoginUserUseCase`, `EditUserUseCase`, `DeleteUserUseCase` | User lifecycle |

The interview pipeline's pure steps live in `src/application/interviewPipeline/` (chunking,
n-gram fingerprinting, pooling, weighted sampling) and are unit-tested independently of the LLM.

## Entry points

### Server actions (`src/actions/`)

Every action is a thin bridge: rate-limit, decide local vs remote, call one use case, return
serializable data or a streamed result.

| Action | Purpose |
| --- | --- |
| `analyzeArtifactAction` / `getAnalysisResult` / `getProgress` / `getScreenshot` | Run an analysis and poll its progress, results, and live screenshot |
| `generatePersonas` / `generateSimilarPersonas` / `generatePersonasFromInterviews` / `getPersonaGenerationResult` | Persona generation and variant generation |
| `chatWithPersona` / `chatWithPanel` | Chat |
| `debateAction` | Debate |
| `recordStep` / `cancelRequest` | Session recording; cancellation |
| `regenPersonaTraits` / `applyCounterfactualTest` / `generateBatchTitleAction` | Persona trait edits, counterfactual checks, batch naming |

### Routes (`src/app/`)

| Route | Notes |
| --- | --- |
| `/` | Marketing landing page |
| `/dashboard` | App shell |
| `/dashboard/new`, `/dashboard/interviews`, `/dashboard/analyses`, `/dashboard/analyses/[id]`, `/dashboard/debates`, `/dashboard/generating/[runId]` | Feature routes |
| `/api/chat`, `/api/report` | Public API routes (`/api/report` is the programmatic analysis endpoint) |
| `/api/vps/*` | VPS-only; 404 off-VPS, bearer-token guarded |

## Data flows

### Personas from a description

```
SetupView → usePersonaFlow → generatePersonasAction
  → GeneratePersonasUseCase.execute(description, mode)
    → LlmServicePort.generate{Research,Strategy,Cluster}Personas()
      → PersonaAdapter → LLM (+ Zod validation, seeded name assignment)
    → backstories → PB&J rationalization → insights
  → personaStore (Zustand + localStorage)
```

### Personas from interviews

```
InterviewUploadClient → useInterviewPipeline → generatePersonasFromInterviewsAction
  → GeneratePersonasFromInterviewsUseCase
      1 extract   InterviewSignalExtractor (one call per transcript, verbatim quotes only)
      2 pool      pooling.ts (n-gram clustering + weighted frequencies)
      3 sample    sampling.ts (weighted draws + LLM coherence validation)
      4 generate  GeneratePersonasUseCase
      5 ingest    IdRagStore (backstory + interview chunks)
```

Full specification:
[`docs/INTERVIEW_TO_PERSONA_PIPELINE.md`](docs/INTERVIEW_TO_PERSONA_PIPELINE.md).

### Artifact analysis

```
analyses page → useAnalysisFlow → analyzeArtifactAction
  → AnalyzeArtifactUseCase
      intake      ArtifactIntakeAdapter (URL → RemotePlaywrightAdapter + HtmlSummarizer,
                                       or screenshot → pass-through)
      per persona VisionAnalysisAdapter: cognitive stage stream → PersonaResponse
      synthesis   synthesizeArtifactResults → ArtifactSynthesis
  → analysisStore (Zustand + IndexedDB)
```

On the VPS this is fire-and-forget: `POST /api/vps/analyze` returns a run ID, and the client polls
`analyze-progress`, `analyze-result`, and `analyze-screenshot`.

Full specification:
[`docs/ARTIFACT_ANALYSIS_FLOW.md`](docs/ARTIFACT_ANALYSIS_FLOW.md).

### Chat and debate

Chat compiles a compartmentalized persona prompt (`PersonaPromptCompiler`), retrieves relevant
ID-RAG chunks (`IdRagService`), and streams the response. Panel chat answers across the cohort;
debate runs turn-based rounds through `DebateAdapter`.

## State and persistence

| State | Where | Survives |
| --- | --- | --- |
| Persona batches | `ui/stores/personaStore.ts` (Zustand + localStorage) | Reload |
| Analyses | `ui/stores/analysisStore.ts` (Zustand + IndexedDB) | Reload |
| Debates, user | `ui/stores/debateStore.ts`, `userStore.ts` | Reload |
| In-flight run results | `infrastructure/AnalysisResultStore.ts`, `PersonaGenerationStore.ts` (globalThis, HMR-safe) | Process only |
| Progress for pollers | `infrastructure/progressStore.ts` | Process only |
| Cancellation | `infrastructure/RequestCancellationManager.ts` | Process only |

## Configuration

- Environment variables: [`README.md`](README.md#environment-variables) and `.env.example`.
- Execution mode: `src/infrastructure/config.ts` (`FORCE_LOCAL`, `VPS_BACKEND_URL`, `VPS_AUTH_TOKEN`).
- Model selection: `LlmServiceImpl.createFromEnv()` holds the OpenRouter model defaults and reads
  `OPENROUTER_MODEL` / `OPENROUTER_CHAT_MODEL` / `OPENROUTER_BASE_URL` overrides. Provider-specific
  choices belong here, never in `domain` or `application`.

## Testing

- `src/**/__tests__/` — unit and integration tests, co-located with the code.
- `test/*.test.ts`, `test/*.spec.ts` — cross-layer and browser E2E; specs spawn `next dev`, so
  files run serially.
- `bun test` runs everything; `bun run release` runs the deterministic gate.

Conventions and expectations: [`CONTRIBUTING.md`](CONTRIBUTING.md). Browser-test patterns:
[`docs/E2E_TEST_GUIDE.md`](docs/E2E_TEST_GUIDE.md).

## Adding a feature

1. Model it in `domain/` (entity and, if it touches an external system, a port).
2. Implement the orchestration in `application/usecases/`.
3. Implement any new port in `infrastructure/adapters/`.
4. Expose it through a server action in `src/actions/`, deciding local vs remote.
5. If it is long-running, add an `src/app/api/vps/<name>/route.ts` following the
   fire-and-forget + polling pattern.
6. Build the UI in `src/ui/` (or `src/app/` for routes), using `bunx plop` to scaffold.
7. Update the tests your change invalidates, then run `bun run release`.

## Related documents

| Document | Covers |
| --- | --- |
| [`docs/ARTIFACT_ANALYSIS_FLOW.md`](docs/ARTIFACT_ANALYSIS_FLOW.md) | Artifact analysis pipeline in depth |
| [`docs/INTERVIEW_TO_PERSONA_PIPELINE.md`](docs/INTERVIEW_TO_PERSONA_PIPELINE.md) | Interview pipeline + domain glossary |
| [`docs/PERSONA_INFERENCE_SYSTEM.md`](docs/PERSONA_INFERENCE_SYSTEM.md) | Research basis for the persona prompts |
| [`docs/PERSONA_MODELING_PHILOSOPHY.md`](docs/PERSONA_MODELING_PHILOSOPHY.md) | Generation modes, provenance, evidence rules |
| [`docs/USE_CASE_TRACES.md`](docs/USE_CASE_TRACES.md) | Call-by-call traces of the main flows |
| [`docs/VPS_DEPLOYMENT.md`](docs/VPS_DEPLOYMENT.md) | Deployment, auth, PM2 |
| [`docs/E2E_TEST_GUIDE.md`](docs/E2E_TEST_GUIDE.md) | Browser tests |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, conventions, release gate |
