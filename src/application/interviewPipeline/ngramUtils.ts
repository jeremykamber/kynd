/** N-gram fingerprinting and cosine similarity for text comparison. */

/** n-gram → occurrence count. */
export type NGramVector = Map<string, number>;

/**
 * Builds a character n-gram fingerprint of `text`: lowercased, whitespace
 * collapsed to single spaces, then every `n`-character window counted.
 *
 * Deterministic. Returns an empty vector when the cleaned text is shorter than
 * `n`. `n` must be at least 1.
 */
export function ngramFingerprint(text: string, n = 3): NGramVector {
  const vec = new Map<string, number>();
  const cleaned = text.toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i <= cleaned.length - n; i++) {
    const gram = cleaned.slice(i, i + n);
    vec.set(gram, (vec.get(gram) ?? 0) + 1);
  }
  return vec;
}

/**
 * Cosine similarity between two fingerprints, in [0, 1] for the non-negative
 * counts this module produces. Returns 0 when either vector is empty or has
 * zero norm.
 */
export function cosineSimilarity(a: NGramVector, b: NGramVector): number {
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
