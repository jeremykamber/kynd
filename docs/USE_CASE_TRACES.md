# System Call Traces: Three Use Cases

> Trace of every function, class, and entity invoked for each major flow.
> Architecture: Hexagonal — UI → Actions → Use Cases → Domain → Infrastructure.
> Canonical flow summary: `docs/ARTIFACT_ANALYSIS_FLOW.md`. Layer rules: `ARCHITECTURE.md`.

---

## Use Case A: Interview Upload → Persona Cohort → Variants

**Goal:** Upload interview transcripts → extract behavioral signals → pool across transcripts → sample coherent personas → generate evidence-grounded profiles → optionally create trait-adjusted variants.

### A1: Interview → Persona Cohort

```
src/ui/interviews/InterviewUploadClient.tsx
  └─ useInterviewPipeline()  (src/ui/hooks/useInterviewPipeline.ts)
      ├─ addFile() — FileReader reads .txt into memory
      ├─ handleSubmit() → FormData (files / file_*, count, mode)
      │   └─ generatePersonasFromInterviewsAction(formData)
      │
      └─ Server Action (src/actions/generatePersonasFromInterviews.ts)
          ├─ pipelineRateLimiter.consume(clientIP) — RateLimiterMemory,
          │    5 req/min per IP (AUDIT_RATE_LIMIT_MAX / AUDIT_RATE_LIMIT_WINDOW_MS)
          ├─ storeProgress(runId, { step: "UPLOADING" })
          ├─ LlmServiceImpl.createFromEnv("openrouter")
          ├─ new IdRagStore() — in-memory chunk store
          ├─ new GeneratePersonasUseCase(llmService)
          │    (constructor dependency of the interview use case)
          ├─ new GeneratePersonasFromInterviewsUseCase(llmService, idRagStore, generatePersonasUseCase)
          │
          └─ execute(files, onProgress, personaCount, generationMode)
              ├─ progress → stream.update(progress) + storeProgress(runId, …)
              └─ DONE → personaGenerationStore.save(runId, personas); storeCompleted(runId)
```

`GeneratePersonasFromInterviewsUseCase.execute` (src/application/usecases/GeneratePersonasFromInterviewsUseCase.ts):

```
execute(transcripts[], onProgress, count, mode = 'synthesized')
  │
  ├── Phase 1: EXTRACTING — Promise.allSettled over all transcripts
  │   └─ llmService.extractInterviewSignals(content, `interview-${i}`)
  │       └─ InterviewSignalExtractor.extract() → ExtractedInterviewSignals
  │           fields: painPoints[], goals[], values[], featureDesires[],
  │                   decisionPatterns[], context{role,industry,teamSize},
  │                   communicationStyle, salientQuotes[]
  │   └─ failed extractions are dropped; zero successes aborts the run
  │
  ├── mode 'individual' → generateIndividual()
  │   └─ per interview: llmService.generateResearchPersonas({
  │         count, personaDescription, interviewIds: [interviewId],
  │         verbatimSource: content, evidenceThreshold: 0.7 })
  │       └─ PersonaAdapter.generateResearchPersonas()
  │
  └── mode 'synthesized' (use-case default) → generateSynthesized()
      ├── Phase 2: POOLING
      │   └─ poolSignals(signals[])  (src/application/interviewPipeline/pooling.ts)
      │       ├─ ngramFingerprint + cosineSimilarity (ngramUtils.ts)
      │       ├─ clusterSignals(...) merges similar signals (threshold 0.7)
      │       └─ WeightedItem[] → PooledDistributionSummary
      │            weight = frequency / totalInterviews
      │
      ├── Phase 3: SAMPLING
      │   └─ samplePersonas(distribution, targetCount, validateCoherence)
      │       ├─ weightedDraw(items, min, max) — weighted draw without replacement
      │       │    painPoints 2-4, goals 1-3, values 2-4, featureDesires 1-3,
      │       │    decisionPattern 1, role 1, industry 1, communicationStyle 1
      │       └─ validateCoherence() → buildCoherenceValidationPrompt()
      │            → llmService.createChatCompletion() → incoherent indices → resample
      │
      ├── Phase 4: FORMAT
      │   └─ formatPersonaDescription(signal) → structured text per SampledPersonaSignal
      │
      ├── Phase 5: GENERATING
      │   └─ llmService.generateResearchPersonas({
      │         count, personaDescription: combined, interviewIds,
      │         verbatimSource: raw transcripts, evidenceThreshold: 0.7 })
      │       └─ PersonaAdapter.generateResearchPersonas()
      │           ├─ generateResearchProfiles() — one batched LLM call
      │           ├─ neutral name assignment (PersonaAdapter.neutralNames)
      │           ├─ backstory per persona (p-limit 4) — evidence-grounded only
      │           ├─ provenance: per-attribute confidence → tier
      │           │    (>=0.8 observed, >=0.6 interpreted, else synthetic)
      │           └─ generationMode: "research"
      │
      └── Phase 6: INGESTING — per persona
          ├─ idRagStore.chunkBackstory(persona.id, persona.backstory ?? "")
          │    └─ detectTone() + topic tagging + linkRelated()
          ├─ chunkInterviewSignals(signals, persona.id)
          │    (src/application/interviewPipeline/chunkInterviewSignals.ts)
          └─ idRagStore.ingestChunks(persona.id, [...backstoryChunks, ...interviewChunks])
```

Note: `useInterviewPipeline` initialises `generationMode` to `'individual'` and the action defaults it the
same way, so uploaded transcripts take the per-interview branch unless the form sends `mode=synthesized`.

### A2: Persona Variants (from an existing persona)

```
DashboardClient.tsx (variant sheet)  (src/ui/dashboard/components/DashboardClient.tsx)
  └─ generateSimilarPersonasAction(referencePersona, { bigFive, variationLevel }, count)
      │   (src/actions/generateSimilarPersonas.ts)
      ├─ LlmServiceImpl.createFromEnv("openrouter")
      ├─ llmService.generateVariationPersonas(referencePersona, adjustments, count)
      │   └─ PersonaAdapter.generateVariationPersonas()
      │       ├─ Big Five targets pinned to the user's adjusted scalars
      │       ├─ variationLevel (0-100) controls creative freedom:
      │       │     0-30  keep occupation/domain, new story + psychographics
      │       │     31-70 moderate life-context changes
      │       │     71-100 full creative freedom, only Big Five fixed
      │       ├─ temperature = 0.7 + (variationLevel / 100) * 0.2
      │       └─ returns Persona[] with generationMode: "strategy"
      │
      └─ stream.done({ step: "DONE", personas }) via createStreamableValue
          → client reads with readStreamableValue
```

### Key Entities

| Entity | File | Role |
|--------|------|------|
| `Persona` | `src/domain/entities/Persona.ts` | Full persona with Big Five, psychographics, backstory, provenance |
| `PersonaProvenance` | `src/domain/entities/PersonaProvenance.ts` | Per-attribute confidence tiers and generation mode |
| `ExtractedInterviewSignals` | `src/application/interviewPipeline/types.ts` | Raw signals from one transcript |
| `PooledDistributionSummary` | `src/application/interviewPipeline/types.ts` | Weighted distribution across all transcripts |
| `SampledPersonaSignal` | `src/application/interviewPipeline/types.ts` | Sampled bundle of signals for one persona |
| `Chunk` | `src/infrastructure/adapters/IdRagStore.ts` | A chunked memory unit (backstory or interview signal) |

### Key Stores

| Store | Location | Type | Purpose |
|-------|----------|------|---------|
| `IdRagStore` | `src/infrastructure/adapters/IdRagStore.ts` | In-memory `Map<personaId, Chunk[]>` | N-gram cosine-similarity retrieval for backstory + interview chunks |
| `usePersonaStore` | `src/ui/stores/personaStore.ts` | Zustand + IndexedDB (`persona-storage`) | `PersonaBatch[]`, active batch, in-flight generation runIds |
| `personaGenerationStore` | `src/infrastructure/PersonaGenerationStore.ts` | In-memory cache on `globalThis` | Final personas for polling clients (VPS / disconnected stream) |
| `progressMap` | `src/infrastructure/progressStore.ts` | In-memory `Map<runId, ProgressState>` | Side-channel progress read by `getProgressAction` |

---

## Use Case B: User Chats with Persona

**Goal:** User sends a message to a specific persona, optionally grounded in the analysis response that persona just produced.

### Flow

```
PersonaChat.tsx / PersonaChatInline.tsx
  (src/ui/dashboard/components/chat/PersonaChat.tsx, PersonaChatInline.tsx)
  └─ chatWithPersonaAction(persona, analysis, message, history)
      │   analysis: ChatAnalysisContext = PricingAnalysis | PersonaResponse | null
      │   (src/actions/chatWithPersona.ts)
      ├─ LlmServiceImpl.createFromEnv("openrouter")
      ├─ llmService.chatWithPersonaStream(persona, analysis, message, history)
      │   └─ LlmServiceImpl.chatWithPersonaStream()
      │       └─ ChatAdapter.chatWithPersonaStream()
      │
      └─ action iterates the AsyncIterable, cumulatively stream.update(fullText)
          → client reads with readStreamableValue
```

`ChatAdapter.chatWithPersonaStream` (src/infrastructure/adapters/ChatAdapter.ts):

```
ChatAdapter.chatWithPersonaStream(persona, analysis, message, history)
  ├─ First interaction with this persona:
  │   └─ ragStore.ingestPersona(persona) — chunks + indexes the backstory
  ├─ Turn tracking: currentTurn % REGROUND_INTERVAL (4) === 0 → needsRegrounding
  ├─ ragService.retrieveContext(persona, message, 3)
  │   └─ ragStore.retrieve(personaId, query, k)
  │       └─ ngramFingerprint + cosineSimilarity → top-3 Chunks
  ├─ chatPromptCompiler.compileChatMessages({
  │     persona, analysis, message, history, ragContext, needsRegrounding })
  │   ├─ PersonaPromptCompiler.compileSystemPrompt(persona, analysisContext)
  │   │   compiles, in order:
  │   │     <<PERSONA IDENTITY>>        demographics + backstory
  │   │     <<PSYCHOGRAPHIC PROFILE>>   Big Five with behavioral rules, values, fears
  │   │     <<PERSONALITY BIAS>>        role-specific bias line
  │   │     <<EPISTEMIC BOUNDARIES>>    what the persona does / does not know
  │   │     <<BEHAVIORAL GUARDRAILS>>   response constraints + refusal patterns
  │   │     <<CONTEXT>>                 analysis context, when present
  │   ├─ PersonaPromptCompiler.generateAnchor(persona)
  │   │   └─ detectArchetype(): cautious-manager | analytical-expert |
  │   │        enthusiastic-hobbyist | passionate-founder | skeptical-veteran |
  │   │        curious-student | jaded-journalist | default
  │   ├─ buildRegroundingInstruction() → <<REGROUND>> block on every 4th turn
  │   ├─ buildSystemMessage() appends <<RETRIEVED MEMORY>> (ID-RAG chunks)
  │   ├─ buildAnalysisContext(): PersonaResponse → first-person "what you saw";
  │   │    legacy PricingAnalysis → scores + raw thoughts; null → pre-test framing
  │   └─ anchor frame as a second system message before the user turn
  └─ llmService.createChatCompletionStream(messages, { temperature: 0.7,
       purpose: "Streaming Chat" }) → AsyncIterable<string>
```

The non-streaming sibling is `LlmServiceImpl.chatWithPersona` (collects the same stream into one
string); the action uses the streaming form.

### Panel chat (whole cohort)

```
PanelChat.tsx  (src/ui/dashboard/components/chat/PanelChat.tsx)
  └─ chatWithPanelAction(responses, synthesis, message, history)
      │   (src/actions/chatWithPanel.ts)
      └─ llmService.chatWithPanelStream(responses, synthesis, message, history)
          └─ ChatAdapter.chatWithPanelStream(...)
              └─ ChatPromptCompiler.compilePanelMessages({ responses, synthesis, … })
                  → llmService.createChatCompletionStream(..., purpose: "Panel Synthesis Chat")
```

### Key Entities / Adapters

| Symbol | File | Role |
|--------|------|------|
| `ChatAdapter` | `src/infrastructure/adapters/ChatAdapter.ts` | Prompt compilation, ID-RAG retrieval, 4-turn re-grounding, streaming |
| `ChatPromptCompiler` | `src/infrastructure/adapters/ChatPromptCompiler.ts` | Assembles OpenAI message arrays for persona + panel chat |
| `PersonaPromptCompiler` | `src/infrastructure/adapters/PersonaPromptCompiler.ts` | Compartmentalised persona prompt, archetype anchor |
| `IdRagService` | `src/infrastructure/adapters/IdRagService.ts` | `indexPersona` + `retrieveContext(persona, query, k)` |
| `ChatAnalysisContext` | `src/domain/ports/LlmServicePort.ts` | `PricingAnalysis \| PersonaResponse \| null` grounding type |

---

## Use Case C: Artifact Analysis → Synthesis → View

**Goal:** User provides an artifact URL or screenshot (+ personas, business goal, research question) → intake captures it → every persona experiences it via a think-aloud monologue → one persona response is extracted per persona → cross-persona synthesis → report.

### Flow

```
src/app/(app)/dashboard/analyses/page.tsx (list + New Analysis form)
  └─ useAnalysisFlow()  (src/ui/hooks/useAnalysisFlow.ts)
      ├─ handleAnalyzeArtifact(personas, input, businessGoal, researchQuestion, batchId)
      │   ├─ useAnalysisStore.getState().addAnalysis({ status: "IN_PROGRESS", … })
      │   └─ analyzeArtifactAction(input, personas, businessGoal, researchQuestion, analysisId)
      │       (src/actions/analyzeArtifactAction.ts)
      │
      ├─ Server Action runLocally
      │   ├─ AnalysisLogger.forRun(id) → JSONL under logs/analysis/
      │   ├─ cancellationManager.createRequest(id) — AbortController
      │   ├─ stream = createStreamableValue({ step: "STARTING", requestId })
      │   ├─ auditRateLimiter.consume(clientIP) — 5 req/min per IP
      │   ├─ RemotePlaywrightAdapter.createFromEnv() — PLAYWRIGHT_WS_ENDPOINT
      │   ├─ LlmServiceImpl.createFromEnv("openrouter")
      │   ├─ new ArtifactIntakeAdapter(browserService, llmService)
      │   ├─ new AnalyzeArtifactUseCase(intakeAdapter, llmService)
      │   └─ useCase.execute(input, personas, businessGoal, researchQuestion,
      │        onProgress, abortSignal, { tokenLimit: PERSONA_TOKEN_LIMIT, runId: id })
      │      onProgress → storeProgress(id, …) + stream.update(progress)
      │
      ├─ After execute:
      │   ├─ completedResponses = responses.filter(overview && journey non-empty)
      │   ├─ new SynthesizeArtifactResultsUseCase(llmService).execute(
      │   │     completedResponses, researchQuestion,
      │   │     { runId, failedCount, totalPersonaCount: responses.length })
      │   ├─ analysisResultStore.save(id, responses, synthesis ?? undefined)
      │   ├─ storeCompleted(id)
      │   └─ stream.done({ step: "DONE", analyses: responses, synthesis })
      │
      └─ Client reads stream via readStreamableValue():
          ├─ STARTING → INTAKE → ANALYZING → DONE | ERROR | CANCELLED
          ├─ Screenshot polling: getScreenshotAction(requestId) every 2s
          ├─ Fallback after stream end: getProgressAction(id) every 3rd attempt and
          │    getAnalysisResultAction(id) every 1s, up to 600 attempts
          └─ useAnalysisStore: updateAnalysis() / markComplete() / markError() / markCancelled()
```

When `shouldRunLocally()` is false, the action POSTs to `${VPS_BACKEND_URL}/api/vps/analyze` and returns the
runId; the VPS route (src/app/api/vps/analyze/route.ts) runs the identical use case + synthesis and writes the
side-channel stores. The client then polls `analyze-progress`, `analyze-screenshot`, and `analyze-result`.

### AnalyzeArtifactUseCase.execute (src/application/usecases/AnalyzeArtifactUseCase.ts)

```
execute(input, personas, businessGoal, researchQuestion, onProgress, abortSignal, options)
  │
  ├── Phase 1: INTAKE — onProgress({ step: "INTAKE" })
  │   └─ intakeAdapter.intake(input, onProgress, runId) → ArtifactIntake
  │       ├─ input.type === "url"
  │       │   └─ captureUrl(url)
  │       │       ├─ browserService.navigateTo(url) — remote Chromium via WS
  │       │       ├─ Promise.all([captureViewport(), getCleanedHtml()])
  │       │       ├─ llmService.summarizeHtml(pageHtml, runId) → summaryPromise
  │       │       │    (off the critical path; only the simulation title awaits it)
  │       │       └─ browserService.close()
  │       └─ input.type === "screenshot"
  │           └─ stripDataUrlPrefix(imageBase64) → pass-through
  │
  ├── Phase 2: ANALYZING — onProgress({ step: "ANALYZING" })
  │   ├─ void generateSimulationTitle(...) — concurrent, failure falls back to
  │   │    the heuristic name (generateAnalysisName)
  │   ├─ p-limit(5) over personas
  │   └─ Per persona:
  │       ├─ llmService.generateVisceralMonologue(persona, intake, researchQuestion,
  │       │     { tokenLimit, runId, artifactName: artifactNameFrom(intake.url) })
  │       │   → VisionAnalysisAdapter.generateVisceralMonologue() → { text }
  │       │     (System 1 — the Actor: screenshot only, first-person monologue)
  │       ├─ llmService.extractPersonaResponse(persona, monologue.text, researchQuestion, …)
  │       │   → VisionAnalysisAdapter.extractPersonaResponse() → PersonaResponse
  │       │     (System 2 — the Anthropologist: transcript only, third-person extraction)
  │       ├─ Assemble full PersonaResponse: rawAnalysis + personaProfile snapshot
  │       ├─ validatePersonaResponse() — on failure, normalizeJourneyOutcomes()
  │       └─ On error → placeholder response with 5 `stopped` stages
  │
  └── Return PersonaResponse[] (Promise.allSettled; zero responses → throw)

Synthesis (src/application/usecases/SynthesizeArtifactResultsUseCase.ts)
  └─ SynthesizeArtifactResultsUseCase.execute(completedResponses, researchQuestion, options)
      ├─ transcripts = responses.map(rawAnalysis + personaId + personaName)
      ├─ llmService.generateCohortSynthesis(researchQuestion, transcripts, options)
      │   └─ VisionAnalysisAdapter.generateCohortSynthesis() → overview,
      │        researchQuestionAnswer, topFindings (with evidenceLocators),
      │        disagreements, biggestFrictions
      ├─ groundSynthesisCitations(content.topFindings, transcripts)
      │   └─ src/application/synthesis/citations.ts — locator → verbatim quote;
      │        misses are dropped, never padded
      └─ adds caller-computed counts: completedCount / failedCount / totalPersonaCount
```

### Report view

```
src/app/(app)/dashboard/analyses/[id]/page.tsx
  ├─ InProgressView — step indicator + live screenshot + completed/total
  ├─ CompletedView
  │   ├─ Executive synthesis (first): counts, research-question answer,
  │   │    top findings with confidence + citations + observed X/Y counts,
  │   │    disagreements, biggest friction points
  │   ├─ fallbackSynthesis(analyses) for runs saved without a synthesis
  │   │    (src/ui/dashboard/utils/fallbackSynthesis.ts)
  │   ├─ CitationTooltip → RawThinkAloudSheet (verbatim transcript highlight)
  │   ├─ Per-persona drill-down: identity card, overview, 5-stage journey,
  │   │    findings, friction, unanswered questions, raw think-aloud
  │   └─ resolveChatPersona() (src/ui/dashboard/utils/resolveChatPersona.ts)
  │        → PersonaChat("Ask … about what they saw")
  └─ PanelChat — "Ask the whole audience" → chatWithPanelAction
```

### Key Entities

| Entity | File | Role |
|--------|------|------|
| `PersonaResponse` | `src/domain/entities/PersonaResponse.ts` | One persona's output: journey, findings, friction, questions, raw transcript |
| `ArtifactIntake` | `src/domain/entities/ArtifactIntake.ts` | Normalised capture: screenshot, HTML, url, off-path summary promise |
| `ArtifactAnalysis` | `src/domain/entities/ArtifactAnalysis.ts` | Container for a run (status, step, counts, responses, synthesis) |
| `ArtifactSynthesis` | `src/domain/entities/ArtifactSynthesis.ts` | Cross-persona synthesis + grounded `SynthesizedFinding.citations` |
| `StageJourney` | `src/domain/entities/StageJourney.ts` | One stage: description, sentiment, outcome, optional transition |
| `COGNITIVE_STAGES` | `src/domain/entities/CognitiveStage.ts` | The 5-stage order enforced by `validatePersonaResponse` |
| `PersonaProfile` | `src/domain/entities/PersonaProfile.ts` | Display projection of a persona embedded in each response |
| `PricingAnalysis` | `src/domain/entities/PricingAnalysis.ts` | @deprecated legacy pricing-era entity |

### Key Adapters

| Adapter | File | Role |
|---------|------|------|
| `ArtifactIntakeAdapter` | `src/infrastructure/adapters/ArtifactIntakeAdapter.ts` | URL → browser capture + off-path HTML summary; screenshot → pass-through |
| `RemotePlaywrightAdapter` | `src/infrastructure/adapters/RemotePlaywrightAdapter.ts` | `BrowserServicePort` over a remote Chromium WebSocket: navigate, capture, scroll, cleaned HTML |
| `VisionAnalysisAdapter` | `src/infrastructure/adapters/VisionAnalysisAdapter.ts` | Monologue prompt, response extraction prompt, cohort synthesis |
| `HtmlSummarizer` | `src/infrastructure/adapters/HtmlSummarizer.ts` | LLM HTML → Markdown compaction (summary promise / title only) |
| `PersonaPromptCompiler` | `src/infrastructure/adapters/PersonaPromptCompiler.ts` | Compartmentalised persona identity prompt |
| `IdRagStore` / `IdRagService` | `src/infrastructure/adapters/IdRagStore.ts` / `src/infrastructure/adapters/IdRagService.ts` | Backstory chunking + n-gram cosine retrieval |
| `PersonaAdapter` | `src/infrastructure/adapters/PersonaAdapter.ts` | Persona generation (research / strategy / cluster / variation) |
| `PsychographicRationalizer` | `src/infrastructure/adapters/PsychographicRationalizer.ts` | PB&J rationales appended during persona generation |

### Key Infrastructure

| Component | File | Role |
|-----------|------|------|
| `AnalysisLogger` | `src/infrastructure/AnalysisLogger.ts` | Per-run JSONL logging with persona latency tracking |
| `AnalysisResultStore` | `src/infrastructure/AnalysisResultStore.ts` | In-memory cache on `globalThis` for polled results |
| `RequestCancellationManager` | `src/infrastructure/RequestCancellationManager.ts` | runId → AbortController; cancel mid-flight |
| `progressMap` | `src/infrastructure/progressStore.ts` | Side-channel progress read by `getProgressAction` |
| `screenshotStore` | `src/infrastructure/screenshotStore.ts` | Latest live screenshot per runId |
| `personaGenerationStore` | `src/infrastructure/PersonaGenerationStore.ts` | Final persona batches per runId |
| `config` | `src/infrastructure/config.ts` | `shouldRunLocally`, `VPS_BACKEND_URL`, `getVpsAuthToken` |

### VPS endpoints (remote path)

| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /api/vps/analyze` | `src/app/api/vps/analyze/route.ts` | Fire-and-forget; returns runId immediately |
| `GET /api/vps/analyze-progress` | `src/app/api/vps/analyze-progress/route.ts` | Poll progress during analysis |
| `GET /api/vps/analyze-result` | `src/app/api/vps/analyze-result/route.ts` | Poll final analyses + synthesis |
| `GET /api/vps/analyze-screenshot` | `src/app/api/vps/analyze-screenshot/route.ts` | Poll live screenshot during intake |
| `GET/POST /api/vps/requests` | `src/app/api/vps/requests/route.ts` | List / cancel active runs |

### Key Domain Ports

| Port | File | Exposes |
|------|------|---------|
| `LlmServicePort` | `src/domain/ports/LlmServicePort.ts` | Persona generation, signal extraction, monologue, response extraction, cohort synthesis, chat (streaming + buffered), variation, rationalisation |
| `BrowserServicePort` | `src/domain/ports/BrowserServicePort.ts` | `navigateTo`, `captureViewport`, `captureScreenshot`, `getCleanedHtml`, `scrollTo/scrollDown`, `getElementLocation`, `close` |
