import type { Persona } from '@/domain/entities/Persona'
import type { PersonaProfile } from '@/domain/entities/PersonaProfile'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { PersonaBatch } from '@/ui/stores/personaStore'

/**
 * Resolves the full Persona behind an analysis response so the report page can
 * chat in-character. Prefers an exact `personaId` match — scoped to `batchId`
 * when given, then across all batches — falls back to a `personaProfile.name`
 * match, and finally reconstructs a degraded persona from the embedded profile.
 *
 * Returns null when no batch holds the persona and the response carries no
 * `personaProfile`.
 */
export function resolveChatPersona(
  analysis: PersonaResponse,
  batches: PersonaBatch[],
  batchId?: string,
): Persona | null {
  const id = analysis.personaId
  const name = analysis.personaProfile?.name

  const exactId = (p: Persona) => p.id === id
  const byName = (p: Persona) => p.name === name

  const scopedBatch = batchId ? batches.find((b) => b.id === batchId) : null
  const batchesToSearch = scopedBatch ? [scopedBatch, ...batches.filter((b) => b.id !== batchId)] : batches

  if (id) {
    for (const batch of batchesToSearch) {
      const found = batch.personas.find(exactId)
      if (found) return found
    }
  }

  if (name) {
    for (const batch of batchesToSearch) {
      const found = batch.personas.find(byName)
      if (found) return found
    }
  }

  return analysis.personaProfile
    ? personaFromProfile(analysis.personaProfile, id ?? analysis.id)
    : null
}

/**
 * Reconstructs a minimal chat-capable Persona from a display projection.
 * Fields the projection lacks (age, education, interests, goals) are blanked;
 * `id` becomes the persona's id.
 */
export function personaFromProfile(
  profile: PersonaProfile,
  id: string,
): Persona {
  const {
    name,
    occupation,
    bigFive: {
      conscientiousness,
      neuroticism,
      openness,
      extraversion,
      agreeableness,
    },
    values,
    fears,
    communicationStyle,
    decisionStyle,
  } = profile

  return {
    id,
    name,
    age: 0, // unknown — compiler renders "—"
    occupation,
    educationLevel: '',
    interests: [],
    goals: [],
    conscientiousness,
    neuroticism,
    openness,
    extraversion,
    agreeableness,
    values: [...values],
    fears: [...fears],
    communicationStyle,
    decisionStyle,
  }
}
