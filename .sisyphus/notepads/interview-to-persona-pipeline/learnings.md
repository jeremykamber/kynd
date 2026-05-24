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

Notes:
- Kept retrieval algorithm and function signatures (retrieve, ingestPersona) intact.
- Tests will need imports updated if they referenced BackstoryChunk type directly.

## Recent fix (IdRagStore duplicate removal)
- Removed a stale private chunkBackstory() implementation that referenced the removed `BackstoryChunk` type and an instance `detectTone()` method. The canonical, exported chunkBackstory(personaId, backstory) implementation remains and is used by ingestPersona().
- Verified: project TypeScript compile output contains NO errors referencing `src/infrastructure/adapters/IdRagStore.ts` (duplicate function errors resolved). Some unrelated test/type issues remain elsewhere in the repo and are outside the scope of this small fix.

Why safe:
- The exported chunkBackstory() is identical in behavior and kept as the single source of truth. Removing the duplicate avoids drift and type mismatches.
