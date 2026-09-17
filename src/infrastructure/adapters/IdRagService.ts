import { Persona } from "@/domain/entities/Persona";
import { IdRagStore, RetrievalResult } from "./IdRagStore";
import { AnalysisLogger } from "@/infrastructure/AnalysisLogger";

export interface RagContext {
  contextString: string;
  chunkCount: number;
}

/**
 * Thin service over the IdRagStore that retrieves the chunks for a persona and
 * formats them into a prompt-ready context string, with optional per-run trace
 * logging. One instance wraps one store; it owns no data of its own.
 */
export class IdRagService {
  constructor(private store: IdRagStore) {}

  retrieveContext(persona: Persona, query: string, k = 3, runId?: string): RagContext {
    const log = runId ? AnalysisLogger.forRun(runId) : null;
    log?.trace("IdRagService", `Retrieving context for "${persona.name}"`, {
      queryPreview: query.slice(0, 100),
      k,
      personaId: persona.id,
    });

    if (!persona.backstory) {
      log?.trace("IdRagService", `No backstory for "${persona.name}", returning empty context`);
      return { contextString: "", chunkCount: 0 };
    }

    const retrieveStart = Date.now();
    const results = this.store.retrieve(persona.id, query, k);
    const retrieveDuration = Date.now() - retrieveStart;

    const contextString = this.store.formatRetrievedContext(results);

    log?.trace("IdRagService", `Retrieval result for "${persona.name}"`, {
      chunkCount: results.length,
      contextLength: contextString.length,
      scores: results.map((r: RetrievalResult) => r.score.toFixed(4)),
      topics: results.map((r: RetrievalResult) => String(r.chunk.metadata["topic"] ?? "unknown")),
      durationUs: retrieveDuration,
    });

    return { contextString, chunkCount: results.length };
  }
}
