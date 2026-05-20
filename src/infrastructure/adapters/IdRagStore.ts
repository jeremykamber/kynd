/**
 * In-memory vector store for ID-RAG (Identity Retrieval-Augmented Generation).
 * Implements the identity graph retrieval approach from Tan et al. (2025).
 *
 * Each persona has:
 * - Chunks of their backstory with metadata (topic, tone, relationships)
 * - Simple embedding via character n-gram hashing for semantic similarity
 * - Top-K retrieval with relevance scoring
 */
import { Persona } from "@/domain/entities/Persona";

export interface BackstoryChunk {
  id: string;
  personaId: string;
  text: string;
  topic: string;
  emotionalTone: "positive" | "negative" | "neutral" | "mixed";
  relatedChunkIds: string[];
  relationshipType: "causal" | "temporal" | "thematic" | "contrast";
}

export interface RetrievalResult {
  chunk: BackstoryChunk;
  score: number;
}

type NGramVector = Map<string, number>;

export class IdRagStore {
  private chunks: Map<string, BackstoryChunk[]> = new Map();

  /** Build character trigram fingerprint for a text. */
  private ngramFingerprint(text: string, n = 3): NGramVector {
    const vec = new Map<string, number>();
    const cleaned = text.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i <= cleaned.length - n; i++) {
      const gram = cleaned.slice(i, i + n);
      vec.set(gram, (vec.get(gram) ?? 0) + 1);
    }
    return vec;
  }

  /** Cosine similarity between two n-gram vectors. */
  private cosineSimilarity(a: NGramVector, b: NGramVector): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [key, valA] of a) {
      const valB = b.get(key) ?? 0;
      dot += valA * valB;
      normA += valA * valA;
    }
    for (const val of b.values()) {
      normB += val * val;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Split backstory text into semantically coherent chunks with metadata. */
  chunkBackstory(
    personaId: string,
    backstory: string,
  ): BackstoryChunk[] {
    if (!backstory || !backstory.trim()) {
      return [];
    }

    const paragraphs = backstory
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 50);

    const topicTags = [
      { keywords: ["childhood", "grew up", "family", "parent", "school", "college", "university"], topic: "early-life" },
      { keywords: ["career", "job", "work", "company", "startup", "role", "position", "promotion", "fired", "laid off"], topic: "career" },
      { keywords: ["money", "purchase", "buy", "cost", "price", "budget", "spend", "saving", "invest", "roi"], topic: "finance" },
      { keywords: ["fail", "loss", "trauma", "scam", "mistake", "regret", "bad", "waste", "terrible"], topic: "setback" },
      { keywords: ["home", "office", "apartment", "environment", "design", "decor", "aesthetic", "style", "clutter"], topic: "environment" },
      { keywords: ["value", "believe", "philosophy", "principle", "priority", "trust", "risk", "efficiency"], topic: "values" },
      { keywords: ["current", "now", "recent", "today", "present", "looking"], topic: "present-outlook" },
    ];

    return paragraphs.map((text, idx) => {
      const lower = text.toLowerCase();
      const matched = topicTags
        .filter((t) => t.keywords.some((kw) => lower.includes(kw)))
        .map((t) => t.topic);

      const tone = this.detectTone(text);
      const chunk: BackstoryChunk = {
        id: `chunk-${personaId}-${idx}`,
        personaId,
        text,
        topic: matched.length > 0 ? matched.join(", ") : "general",
        emotionalTone: tone,
        relatedChunkIds: [],
        relationshipType: "temporal",
      };
      return chunk;
    });
  }

  private detectTone(text: string): BackstoryChunk["emotionalTone"] {
    const lower = text.toLowerCase();
    const positive = ["love", "great", "excited", "happy", "success", "proud", "wonderful", "thrilled"];
    const negative = ["hate", "terrible", "awful", "angry", "regret", "fail", "worst", "trauma", "scam", "loss"];

    let posScore = 0;
    let negScore = 0;

    for (const w of positive) {
      if (lower.includes(w)) posScore++;
    }
    for (const w of negative) {
      if (lower.includes(w)) negScore++;
    }

    if (posScore > 0 && negScore > 0) return "mixed";
    if (posScore > 0) return "positive";
    if (negScore > 0) return "negative";
    return "neutral";
  }

  /** Link related chunks (those adjacent or same-topic). */
  private linkRelated(chunks: BackstoryChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const related: string[] = [];

      if (i > 0) related.push(chunks[i - 1].id);
      if (i < chunks.length - 1) related.push(chunks[i + 1].id);

      for (let j = 0; j < chunks.length; j++) {
        if (j !== i && chunks[j].topic === chunks[i].topic) {
          if (!related.includes(chunks[j].id)) {
            related.push(chunks[j].id);
          }
        }
      }

      chunks[i].relatedChunkIds = related.slice(0, 5);
    }
  }

  /** Ingest a persona's backstory into the store. */
  ingestPersona(persona: Persona): void {
    if (!persona.backstory) return;
    const chunks = this.chunkBackstory(persona.id, persona.backstory);
    this.linkRelated(chunks);
    this.chunks.set(persona.id, chunks);
  }

  /** Retrieve top-K chunks most relevant to a query. */
  retrieve(
    personaId: string,
    query: string,
    k = 3,
  ): RetrievalResult[] {
    const personaChunks = this.chunks.get(personaId);
    if (!personaChunks || personaChunks.length === 0) return [];

    const queryVec = this.ngramFingerprint(query);

    const scored = personaChunks.map((chunk) => ({
      chunk,
      score: this.cosineSimilarity(queryVec, this.ngramFingerprint(chunk.text)),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Build a RAG context string from retrieved chunks. */
  formatRetrievedContext(results: RetrievalResult[]): string {
    if (results.length === 0) return "";

    return results
      .map(
        (r, i) =>
          `[Relevant Memory ${i + 1}] (Topic: ${r.chunk.topic}, Tone: ${r.chunk.emotionalTone})\n${r.chunk.text}`,
      )
      .join("\n\n");
  }

  /** Clear all chunks for a persona. */
  clearPersona(personaId: string): void {
    this.chunks.delete(personaId);
  }
}
