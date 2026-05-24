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
