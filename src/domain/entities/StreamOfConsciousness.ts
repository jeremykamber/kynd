/**
 * A raw first-person monologue produced by the persona while experiencing an
 * artifact, paired with the identity that produced it.
 */
export interface StreamOfConsciousness {
  text: string;
  personaId: string;
  personaName: string;
}

/**
 * Accepts a value shaped like StreamOfConsciousness whose text is long enough
 * to be a real monologue (at least 20 characters) and whose identity is
 * non-empty. Type guard: narrows `entity` on success.
 */
export function validateStreamOfConsciousness(
  entity: unknown
): entity is StreamOfConsciousness {
  if (!entity || typeof entity !== "object") return false;
  const obj = entity as Record<string, unknown>;

  if (typeof obj.text !== "string" || obj.text.trim().length < 20) return false;
  if (typeof obj.personaId !== "string" || obj.personaId.trim().length === 0)
    return false;
  if (typeof obj.personaName !== "string" || obj.personaName.trim().length === 0)
    return false;

  return true;
}
