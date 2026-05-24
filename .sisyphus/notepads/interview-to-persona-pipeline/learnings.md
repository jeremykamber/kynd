# Interview-to-Persona Pipeline - Learnings

## Project Conventions
- Hexagonal architecture: `src/domain/ports/`, `src/infrastructure/adapters/`, `src/application/usecases/`
- Pattern A adapters: Constructor takes `LlmServiceImpl`, delegate to it via `createChatCompletion`
- Typescript strict mode, no `@ts-ignore` or `@ts-nocheck`
- Tests use vitest, alongside source files in `__tests__/` dirs
- Persona entity uses `interface` not class, validated with Zod schema
## IdRagStore changes
- Extracted generic Chunk type replacing BackstoryChunk
- Exported chunkBackstory(), detectTone(), linkRelated() for reuse
- IngestPersona still accepts Persona and uses chunkBackstory internally
- New ingestChunks(personaId, chunks) allows ingesting prebuilt chunks
- formatRetrievedContext is chunk-type aware (backstory vs interview)

## Verification: IdRagService + Chat flow for interview chunks

- IdRagService.retrieveContext(persona, query, k) calls IdRagStore.retrieve() and then IdRagStore.formatRetrievedContext(). Confirmed in src/infrastructure/adapters/IdRagService.ts lines 28-37.
- ChatAdapter.chatWithPersonaStream() calls ragService.retrieveContext() and inserts the returned contextString into the system prompt under <<RETRIEVED MEMORY>>. Confirmed in src/infrastructure/adapters/ChatAdapter.ts lines 52-56 and 77-81.
- PersonaPromptCompiler compiles the <<RETRIEVED MEMORY>> section as a plain string (text-agnostic). Confirmed in src/infrastructure/adapters/PersonaPromptCompiler.ts lines 195-201.
- No code changes required for interview chunk retrieval; the existing generic Chunk flow covers both backstory and interview chunks.

Note: Global TypeScript check (bunx --bun tsc --noEmit) failed due to unrelated test/type fixture issues (missing/incorrect Persona test fixtures). These do not affect the runtime RAG flow but block a full repo typecheck. Recommend fixing test fixtures in a follow-up if a clean build is required.

Notes:
- Kept retrieval algorithm and function signatures (retrieve, ingestPersona) intact.
- Tests will need imports updated if they referenced BackstoryChunk type directly.

## Recent fix (IdRagStore duplicate removal)
- Removed a stale private chunkBackstory() implementation that referenced the removed `BackstoryChunk` type and an instance `detectTone()` method. The canonical, exported chunkBackstory(personaId, backstory) implementation remains and is used by ingestPersona().
- Verified: project TypeScript compile output contains NO errors referencing `src/infrastructure/adapters/IdRagStore.ts` (duplicate function errors resolved). Some unrelated test/type issues remain elsewhere in the repo and are outside the scope of this small fix.

Why safe:
- The exported chunkBackstory() is identical in behavior and kept as the single source of truth. Removing the duplicate avoids drift and type mismatches.
