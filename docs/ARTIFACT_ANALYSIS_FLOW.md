# Artifact Analysis Pipeline

## What It Does

Takes any artifact (URL, screenshot, or document/pasted text) + personas + a business goal and research question → produces a structured report of how simulated target customers experienced the artifact through five cognitive stages.

Documents never cross the server boundary as bytes: the browser extracts their text (`ArtifactTextExtractor`), so the action receives a `{ type: "text" }` input like it receives a URL.

---

## End-to-End Flow

```
User Input
├── Artifact (URL, screenshot, or text)
├── Persona batch (generated from audience description)
├── Business Goal (what the artifact tries to accomplish)
└── Research Question (what the user wants to learn)

    ↓

1. ARTIFACT INTAKE
   └── Normalizes the artifact into ArtifactIntake
       ├── URL → BrowserServicePort navigates, takes screenshot, summarizes HTML
       ├── Screenshot → Direct pass-through
       └── Text → validates the 80,000-character cap, no browser, no screenshot

    ↓

2. PERSONA ANALYSIS (concurrent, max 5 at a time)
   └── For each persona:
       ├── Stage 1: generateVisceralMonologue()
       │   └── LLM sees the screenshot (vision model) or the document text (text model) + persona identity
       │   └── Persona thinks aloud through all 5 cognitive stages
       │
       └── Stage 2 (parallel):
           ├── extractPersonaResponse()
           │   └── LLM (text model) extracts structured PersonaResponse from the monologue
           └── extractPersonaClaims()
               └── LLM extracts 3-7 claims, each with a verbatim quotation
               └── A failed claim pass leaves the persona response intact

    ↓

3. CLAIM LEDGER (code owns every count)
   ├── collectVerbatimClaims()   — drops any quote that is not an exact substring
   ├── verifyClaimSupport()      — one batch call; only `support` claims survive
   ├── clusterClaims()           — one batch call; omitted claims become one-claim groups
   └── buildClaimLedger()        — distinct-persona counts, citations, verdict tally

    ↓

4. SYNTHESIS FROM THE PLAN
   ├── buildSynthesisPlan()      — selects findings, splits, frictions; no raw transcript
   ├── synthesizeFromPlan()      — writer returns wording keyed by group id
   ├── buildArtifactSynthesis()  — code joins wording to counts, citations, `No clear view`
   ├── validateSynthesis()       — counts, citations, numbers, quantifiers, names, recommendations
   └── repairSynthesis()         — one repair; failures become `validationWarnings`

    ↓

5. OUTPUT
   ├── Executive Synthesis (first, always visible)
   │   ├── Completed/failed persona counts
   │   ├── Research Question Answer
   │   ├── Top Findings (with observed X/Y counts)
   │   ├── Disagreements (where personas split, always with `No clear view`)
   │   └── Biggest Friction Points
   │   └── Validation warnings (banner, inline marks, PDF stamp)
   └── Individual Persona Reports (collapsible drill-down)
       ├── Overview
       ├── Customer Journey (5 stages)
       ├── Research Question Answer
       ├── Findings
       ├── Friction Points
       └── Unanswered Questions
```

---

## File Map

### Domain Entities (`src/domain/entities/`)

| File | Purpose |
|------|---------|
| `PersonaResponse.ts` | One persona's complete output — journey, findings, friction, questions |
| `CognitiveStage.ts` | The 5-stage enum + labels + question text |
| `StageJourney.ts` | One stage's result: description, sentiment, outcome, transition |
| `MajorFinding.ts` | Per-persona finding: observation, evidence, impact (no confidence — derived at synthesis) |
| `ArtifactInput.ts` | What the caller hands the pipeline: `url`, `screenshot`, or already-extracted `text` |
| `ArtifactIntake.ts` | Normalized artifact input: screenshot **or** text, plus optional HTML/summary and prompt framing |
| `ArtifactIntakeLimits.ts` | Accepted formats, size/character caps and their messages — the only definition |
| `ArtifactAnalysis.ts` | Container entity for a run |
| `ArtifactSynthesis.ts` | Cross-persona synthesis: top findings, disagreements, frictions, verdicts, ledger references, warnings |
| `PersonaClaim.ts` | Claims, support levels, groups, and the ledger |
| `SynthesisPlan.ts` | The code-built writer input and the writer's draft shape |
| `ArtifactProfile.ts` | Artifact facts, content kind, and stage-anchor rules |
| `SimulationFrame.ts` | Per-persona role task, entry point, decision question; built by pure code |
| `DecisionRole.ts` | The four fixed decision roles and their schema |
| `Verdict.ts` | The four fixed verdicts and normalization |
| `PricingAnalysis.ts` | @deprecated Legacy pricing-specific entity |

### Ports (`src/domain/ports/`)

| File | Key Methods |
|------|-------------|
| `LlmServicePort.ts` | `generateVisceralMonologue`, `extractPersonaResponse`, `extractPersonaClaims`, `verifyClaimSupport`, `clusterClaims`, `synthesizeFromPlan`, `repairSynthesis` |
| `BrowserServicePort.ts` | `navigateTo`, `captureViewport`, `getCleanedHtml`, `close` |

### Use Cases (`src/application/usecases/`)

| File | Purpose |
|------|---------|
| `AnalyzeArtifactUseCase.ts` | Orchestrates intake → persona analysis → response assembly |
| `BuildClaimLedgerUseCase.ts` | Runs the batch support gate and clustering, then builds the ledger |
| `SynthesizeArtifactResultsUseCase.ts` | Writes from the plan, assembles code-owned counts, validates, repairs once |

### Actions (`src/actions/`)

| File | Purpose |
|------|---------|
| `analyzeArtifactAction.ts` | Server action: instantiates deps, calls use case, runs synthesis, streams progress + DONE event |
| `getProgress.ts` | Side-channel progress store for VPS polling |
| `getAnalysisResult.ts` | Polls completed results after reconnect |

### Adapters (`src/infrastructure/adapters/`)

| File | Purpose |
|------|---------|
| `ArtifactIntakeAdapter.ts` | Intake by input kind: URL → browser, screenshot → pass-through, text → validated pass-through |
| `ArtifactTextExtractor.ts` | File → text (PDF, DOCX, PPTX, TXT, MD, CSV, JSON, RTF), concatenation and the character cap; shared by the form and `scripts/verify-output.ts` |
| `VisionAnalysisAdapter.ts` | Monologue and extraction prompts |
| `ClaimLedgerAdapter.ts` | Claim pass, support gate, clustering, plan writer, repair prompts |
| `PersonaPromptCompiler.ts` | Builds the 4-compartment persona identity prompt |
| `IdRagStore.ts` / `IdRagService.ts` | Backstory chunking + retrieval for persona context |
| `HtmlSummarizer.ts` | LLM-based HTML → markdown compaction |
| `RemotePlaywrightAdapter.ts` | Browser automation via Playwright WebSocket |
| `LlmServiceImpl.ts` | Delegates all LlmServicePort methods to above adapters |

### UI (`src/app/(app)/dashboard/analyses/`)

| File | Purpose |
|------|---------|
| `page.tsx` | Analyses list + New Analysis form (Business Goal + Research Question inputs) |
| `[id]/page.tsx` | Detail page: InProgressView + CompletedView with synthesis + per-persona reports |

### Hook (`src/ui/hooks/`)

| File | Purpose |
|------|---------|
| `useAnalysisFlow.ts` | Manages state, calls action, handles streaming DONE/ERROR/CANCELLED, captures synthesis |

### Store (`src/ui/stores/`)

| File | Purpose |
|------|---------|
| `analysisStore.ts` | Zustand + IndexedDB persistence for analyses (version 3, wipes old data) |

### Utility

| File | Purpose |
|------|---------|
| `src/ui/dashboard/utils/fallbackSynthesis.ts` | Empty synthesis carrying the caller-known counts, for analyses that finished without server-side synthesis |

### VPS (`src/app/api/vps/`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/vps/analyze` | Fire-and-forget: returns runId immediately |
| `GET /api/vps/analyze-progress?runId=` | Poll progress during analysis |
| `GET /api/vps/analyze-result?runId=` | Poll final results after completion |
| `GET /api/vps/analyze-screenshot?runId=` | Poll live screenshot during intake |

---

## The Five Cognitive Stages

Every persona progresses through the same five stages in order. Each stage answers a specific cognitive question — not a browsing question.

| # | Stage | Core Question |
|---|-------|--------------|
| 1 | interpretation | What did I initially believe this was? |
| 2 | understanding | What became clear? What remained confusing? |
| 3 | belief | Which claims, signals, or details increased or decreased trust? |
| 4 | motivation | Did this become valuable enough for me to continue? Why or why not? |
| 5 | action | What exact next step would I take? |

Each stage has:
- `description` — what the persona thought/felt at this stage (NOT what they saw)
- `sentiment` — positive, neutral, or negative
- `outcome` — succeeded (passed through), blocked (couldn't progress), or stopped (abandoned)
- `transition` — what caused progression to the next stage (optional)

Invariant: every `PersonaResponse` has exactly 5 stages, in order. The validator (`validatePersonaResponse`) enforces this.

---

## Decision Frames and Verdicts

Each persona runs against a code-built `SimulationFrame`:

| Role | Task | Starting point |
|---|---|---|
| `economic_buyer` | Judge the money, payback, and risk of saying yes. | Price, terms, proof of return. |
| `daily_user` | Judge the first use, the daily work, and the effort to switch. | The first task and the current workaround. |
| `blocker` | Judge what would stop you approving this for your team. | Security, integration, migration, support. |
| `champion` | Judge whether you could sell this internally and defend it. | Team pain, internal proof, and the ask. |

A missing role falls back to `daily_user` with `decisionRoleSource: "fallback"`.
The frame is deterministic: the same persona and artifact profile produce the
same frame every run. The monologue prompt receives the frame; it does not
receive the verdict set.

Every persona then returns one verdict from the fixed set: `adopt`, `trial`,
`reject`, `undecided`. A missing or invalid model value becomes `undecided`.
The role shapes the reasoning and never implies the verdict.

## Synthesis Pipeline

The cohort report is built in two steps: code derives the facts, then a writer
supplies wording. Counts, citations, splits, confidence, and verdict tallies
never come from model prose.

```
Claim pass (per persona, parallel with extraction)
  └── 3-7 claims, each with a token-for-token quotation

Support gate (one batch call, one retry)
  └── support | partial | unsupported
  └── only `support` enters the ledger; failure after retry fails the run

Clustering (one batch call, one retry)
  └── groups claims by topic; failure after retry keeps one-claim groups

Plan (pure code)
  └── findings at the cohort floor, splits, frictions, counts

Writer (one call, one repair)
  └── receives the plan, never a raw transcript
  └── returns wording keyed by group id

Assembly + validation (pure code)
  └── joins wording to counts and citations
  └── every split carries `No clear view` and sums to completed
  └── rejected fields persist in `validationWarnings`, render inline, and stamp the PDF
```

### Finding floor

A finding needs two distinct personas for a cohort of five or fewer, and three
for six or more. A one-persona cohort can use its single persona.

### Confidence

```
ratio = group.personaCount / completedCount
ratio >= 0.75 → strongly supported
ratio >= 0.40 → some support
else         → weakly supported
```

### Failure boundaries

| Failure | Behaviour |
|---|---|
| Claim pass | Persona survives with no claims; the missing set is recorded and counts as one QA mark |
| Support gate | One retry, then the run fails and no synthesis is saved |
| Clustering | One retry, then each supported claim becomes its own group |
| Validation | One repair; a still-failing draft keeps its wording and is marked |

## Key Invariants

- `PersonaResponse` is one persona's output, never aggregate
- `ArtifactAnalysis` is the container for a run, never per-persona
- All prompts are artifact-agnostic — no mention of pricing, conversion, or page type
- Stage order is enforced by `validatePersonaResponse` (5 stages, in `COGNITIVE_STAGES` order)
- Failed personas get 5 placeholder stages (all `stopped`) so they pass validation
- Confidence is derived from the ledger, never generated by the LLM
- Only `support` claims enter a group; a claim without a verbatim quotation never counts
- A persona is counted once per topic, never once per claim
- Every disagreement split includes `No clear view` and sums to the completed count
- The writer receives a plan, never a raw transcript
- Intake strategies are decoupled from analysis pipeline (new artifact types = new strategies)
- Records written before `inputKind` existed still render: a `url` of `"Screenshot Upload"` reads as a screenshot run, and absent text fields fall back to the screenshot view.

---

## Extending

### Adding a document format

1. Add the extension to `EXTENSION_TO_KIND` in `ArtifactIntakeLimits.ts` (the accepted-extension list is derived from it)
2. Add a branch to `extractOne` in `src/lib/artifactText.ts` (dynamic import of the parser)
3. Add a real fixture and a case to `ArtifactTextExtractor.test.ts` — a hand-written stub is not proof

Prompts do not branch per format: text runs are framed as "a document", and the persona infers the kind from the text.

### Adding a new cognitive stage

1. Add it to `CognitiveStage.ts` (`COGNITIVE_STAGES` array)
2. Update all prompts in `VisionAnalysisAdapter.ts`
3. Update `validatePersonaResponse()` expected length
4. Update UI rendering in `analyses/[id]/page.tsx`

### Adding a new finding type

1. Add to `MajorFinding.ts` (per-persona) or `ArtifactSynthesis.ts` (cross-persona)
2. Add it to the relevant prompt
3. Add it to the schema if used with `streamObject`

---

## Deployment

The VPS runs two PM2 processes:
- `kynd-backend-engine` — Next.js standalone on port 8080
- `kynd-browser-server` — Playwright browser server on port 8081

Build and deploy:
```bash
git pull origin dev
bun run build
npx pm2 restart kynd-backend-engine
```

If Playwright version changes, run `npx playwright install` after the build.

See `docs/VPS_DEPLOYMENT.md` for full deployment details.
