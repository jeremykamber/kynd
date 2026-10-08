import type { Persona } from '@/domain/entities/Persona'
import { ExpiringStore } from './ExpiringStore'

interface StoredPersonaGeneration {
  personas: Persona[]
  completedAt: string
  error?: string
}

/**
 * Server-side in-memory store for completed persona-generation runs.
 * Generation runs in a fire-and-forget IIFE (on the VPS or in-process); this
 * store captures the final personas, or the failure, so a polling GET can
 * fetch them after the original request has returned.
 *
 * Runs live for 30 minutes after the last save, then are dropped. Writes come
 * from the generation actions/routes; reads come from
 * `src/actions/getPersonaGenerationResult.ts` and
 * `src/app/api/vps/persona-result/route.ts`.
 */
class PersonaGenerationStore {
  private readonly store = new ExpiringStore<StoredPersonaGeneration>(
    '__kynd_persona_generation_results',
    '__kynd_persona_generation_cleanups',
  );

  save(runId: string, personas: Persona[]): void {
    console.log(`[PERSONA_STORE] Saving ${personas.length} personas for ${runId}`);
    this.store.set(runId, {
      personas,
      completedAt: new Date().toISOString(),
    });
  }

  saveError(runId: string, error: string): void {
    console.log(`[PERSONA_STORE] Saving error for ${runId}: ${error}`);
    this.store.set(runId, {
      personas: [],
      completedAt: new Date().toISOString(),
      error,
    });
  }

  get(runId: string): StoredPersonaGeneration | undefined {
    return this.store.get(runId);
  }

  remove(runId: string): void {
    this.store.delete(runId);
  }
}

export const personaGenerationStore = new PersonaGenerationStore();
