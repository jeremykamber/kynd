# Refactor log

This file is the memory of the automated refactor steward. Every run appends one entry.
Entries are never rewritten; a later run that reverses an earlier decision adds a new entry
and says why.

Why this file exists:

- **No loops.** A run reads this before choosing work, so it does not redo a refactor that
  already landed.
- **Reasons survive.** A diff says what changed; this says why, and which alternative lost.
- **Doubts stay visible.** A trade-off recorded here is a question for a later run that has
  more evidence. If the codebase moved on, that run should answer it explicitly.

How to read it: newest entries at the bottom. Each entry names the smell, the change, the
principle behind it, what was verified, and what remains uncertain.

<!-- Entries below this line are appended by the steward. -->

## 2026-11-21 — break the LLM adapter import cycle, add an intake port

- **Commit(s):** f46b8ca, d44a276, ef2d974, fa842d6, e4b6710
- **Area:** `src/infrastructure/adapters/`, `src/domain/ports/ArtifactIntakePort.ts`,
  `src/application/usecases/AnalyzeArtifactUseCase.ts`, `src/ui/dashboard/demoPersonaBatch.ts`
- **Smell(s):** dependency cycle (one strongly connected component of seven modules), information
  leakage (the same completion-option shape written twice), a layer violation in both directions
  (`domain` → `ui`, `application` → `infrastructure`), a test that could only stand in for a stub
  by naming a concrete adapter, and a demo fixture living in `domain/entities`.
- **Change:** `LlmRuntime` is a new interface in `infrastructure/adapters` that states what a
  sub-adapter may use: the provider client, the model ids, and the two completion primitives that
  carry retry, rate limiting and logging. `LlmServiceImpl` implements it; `PersonaAdapter`,
  `VisionAnalysisAdapter`, `ChatAdapter`, `HtmlSummarizer`, `InterviewSignalExtractor`,
  `PsychographicRationalizer`, `DebateAdapter`, `InCharacterEvaluator` and `PiconEvaluator` import
  the interface and take a `runtime` field instead of the service. Both completion primitives now
  take one `LlmCompletionOptions` type, which replaced two verbatim copies and an `any` message
  parameter. `ArtifactIntakePort` states the intake contract that `ArtifactIntakeAdapter`
  implements and `AnalyzeArtifactUseCase` depends on. The demo batch moved from
  `domain/entities/MockPersonas.ts` to `src/ui/dashboard/demoPersonaBatch.ts`.
- **Why:** a cycle means a reader cannot understand any module in it alone. Dependency-cruiser
  reported six circular warnings for the same knot; sub-adapters imported the orchestrator only for
  the type of their own constructor parameter, which is the smallest possible reason to depend on
  the largest possible module. Inverting that edge on a declared contract keeps the same behaviour
  and lets each sub-adapter state its reach in one line. The intake port applies the same rule one
  layer up: an application use case should name a capability, not a Playwright-backed class.
- **Design-it-twice:** for the cycle, (A) declare a narrow `LlmRuntime` interface that the service
  implements, versus (B) extract a concrete `LlmRuntime` object holding the provider, models,
  limiter, retry and primitives, and shrink `LlmServiceImpl` to a facade. (B) is the deeper end
  state but moves retry and request plumbing across 768 lines with no test that exercises live
  model calls; (A) removes the cycle, names the contour, and leaves (B) as a later, separately
  verifiable step. For intake, (A) a domain port with `intake(input, onProgress?, runId?)`, versus
  (B) passing a bound `intake` function. (B) needs its own type alias anyway and hides the stage
  callback and run-id contract, so (A) won.
- **Verified:** `bun run test` and `bun run release` both end at 626 passed / 1 failed, which is
  exactly the baseline measured on the untouched tree before any edit (`.refactor/work/`
  `baseline-test.log`): `test/artifact-text-input.spec.ts` › “lists uploaded documents, removes
  one, and updates the totals”, `expected 1 to be +0`. `next build` passes inside `release`.
  `tsc --noEmit` is clean. dependency-cruiser: 15 violations → 5, circular warnings 6 → 0, cycles
  1 → 0, `domain-stays-pure` 1 → 0. Focused suites green: 31 files / 256 tests for
  `src/infrastructure/adapters` + `src/application`, and the intake/use-case files after the port.
- **Doubts / trade-offs:** `LlmRuntime` is a declaration-only interface, so its value is the cycle
  removal and the stated contour, not hidden functionality. If a later run extracts the concrete
  runtime object (option B above), delete the interface in favour of that class rather than keeping
  both. `LlmMessages` accepts two shapes — the OpenAI parameter type and the plain
  `{ role, content }` form the port already declares — because narrowing the port would drag the
  provider SDK into `domain`; unifying them is a separate decision.
- **Noticed, not fixed:** (1) the failing browser spec above is pre-existing and reproducible on the
  base commit; the click-to-remove path leaves the file name in the DOM. (2) `bun run lint` is red
  on the base commit; per-file counts were measured before and after and no file got worse. Known
  debt: `RemotePlaywrightAdapter` (`var`, `any`), `VisionAnalysisAdapter` and `PersonaAdapter` and
  `InterviewSignalExtractor` (`any` around parsed model output), several unused imports. (3) The
  remaining `application` → `infrastructure` edges and the plan: `AnalysisLogger` needs a logging
  port (or a per-run logger object) before `AnalyzeArtifactUseCase` can drop it; `IdRagStore`
  needs its `Chunk` type moved inward and a port declared, which removes the
  `GeneratePersonasFromInterviewsUseCase` and `chunkInterviewSignals` edges together. (4)
  `ARCHITECTURE.md` still records that `infrastructure` imports `application/interviewPipeline`
  (`ngramUtils` at runtime, `ExtractedInterviewSignals` as a type) and that
  `domain/ports/LlmServicePort.ts` imports the same type; that inversion is untouched and belongs
  in a run that is willing to move types into `domain`.
