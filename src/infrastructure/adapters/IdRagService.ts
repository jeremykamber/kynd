import { Persona } from "@/domain/entities/Persona";
import { IdRagStore, RetrievalResult } from "./IdRagStore";

export interface RagContext {
  contextString: string;
  chunkCount: number;
}

/**
 * ID-RAG (Identity Retrieval-Augmented Generation) service.
 * Implements the two-tier hybrid architecture described in Section 9 of
 * the Kynd literature review (Tan et al., 2025):
 *
 * Tier 1: Condensed persona backstory (full narrative for stylistic fidelity)
 * Tier 2: Retrieved chunks from the identity store (for factual anchoring)
 *
 * At runtime, combines: condensed backstory + top-3 relevant chunks +
 * compartmentalized persona prompt + persona anchor.
 */
export class IdRagService {
  constructor(private store: IdRagStore) {}

  /** Ingest a persona's full backstory into the identity store. */
  indexPersona(persona: Persona): void {
    this.store.ingestPersona(persona);
  }

  /** Retrieve context relevant to a user query. */
  retrieveContext(persona: Persona, query: string, k = 3): RagContext {
    if (!persona.backstory) {
      return { contextString: "", chunkCount: 0 };
    }

    const results = this.store.retrieve(persona.id, query, k);
    const contextString = this.store.formatRetrievedContext(results);

    return { contextString, chunkCount: results.length };
  }

  /** Build the full hybrid prompt for a persona interaction.
   *  Combines: condensed backstory + ID-RAG context + user message.
   */
  buildHybridPrompt(
    persona: Persona,
    query: string,
    options?: {
      systemPrompt?: string;
      ragContext?: string;
    },
  ): string {
    const parts: string[] = [];

    if (options?.systemPrompt) {
      parts.push(options.systemPrompt);
    }

    if (options?.ragContext) {
      parts.push(options.ragContext);
    }

    parts.push(`User says: "${query}"`);
    return parts.join("\n\n");
  }
}
