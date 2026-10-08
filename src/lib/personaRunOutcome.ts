import type { Persona } from '@/domain/entities/Persona'
import { resolveBatchLabel } from '@/lib/resolveBatchLabel'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'

/**
 * Turning a settled persona generation into the batch the dashboard lists.
 *
 * A run can be observed from more than one place: the hook that started it
 * (streaming locally, polling the VPS otherwise) and `PersonaProgressToaster`,
 * which polls every active run so a generation started on one page still lands
 * in the list after the user navigates away. Exactly one of them may write the
 * batch, and the batch they write must be identical either way — so the entity
 * is built here, once, instead of at each observation site.
 *
 * A run is written at most once, decided by `batch.runId`:
 *
 * - a batch already carrying the run id means the outcome is stored, so a
 *   later observation (a stale poll, a reload) is a no-op rather than a
 *   duplicate row;
 * - while the naming call is in flight the run is reserved in memory, because
 *   two observers can resolve within the same second and neither has written
 *   anything for the other to see yet.
 *
 * Callers get the batch they created, or `null` when another observer owns the
 * run. They must not build the entity themselves: a locally built batch that
 * loses the race is not in the store, so any id taken from it (for navigation,
 * say) points at nothing.
 */

/** Run ids whose naming call is in flight. Cleared as each one settles. */
const namingInFlight = new Set<string>()

/**
 * `pt-` runs were started from a description; everything else comes from the
 * interview pipeline. Run-id prefixes are the only thing that distinguishes
 * them in the polling paths, which see a run id but not a form.
 */
export const sourceOf = (runId: string): 'description' | 'interviews' =>
    runId.startsWith('pt-') ? 'description' : 'interviews'

export interface PersonaRunOutcome {
    runId?: string
    personas: Persona[]
    source: 'description' | 'interviews'
    /** Used when the model returns no title, or when naming fails. */
    fallbackLabel: string
    /** Shapes the model's title; the setup flow passes the user's brief. */
    description?: string
    transcriptCount?: number
}

/**
 * Stores the batch for a settled run, naming it from its personas first.
 * Returns `null` when the run's batch already exists or another observer is
 * writing it — the caller should then leave navigation alone rather than
 * assume it produced the row.
 */
export async function persistPersonaBatchForRun(
    outcome: PersonaRunOutcome,
): Promise<PersonaBatch | null> {
    const { runId, personas, source, fallbackLabel, description, transcriptCount } = outcome

    if (runId) {
        if (namingInFlight.has(runId) || hasBatchForRun(runId)) return null
        namingInFlight.add(runId)
    }

    try {
        const label = await resolveBatchLabel(fallbackLabel, personas, {
            source,
            description,
            transcriptCount,
        })
        const batch: PersonaBatch = {
            id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            label,
            source,
            transcriptCount,
            createdAt: new Date().toISOString(),
            personas,
            runId,
        }
        usePersonaStore.getState().addBatch(batch)
        return batch
    } finally {
        if (runId) namingInFlight.delete(runId)
    }
}

/**
 * A failed run is still stored as a batch, with no personas and the error text.
 * It used to leave nothing behind at all: the toast expired, the run id was
 * dropped, and a user could not tell that a run had ever been attempted, let
 * alone why it died.
 */
export function recordFailedPersonaBatch(runId: string, error: string | undefined): void {
    if (hasBatchForRun(runId)) return

    const source = sourceOf(runId)
    usePersonaStore.getState().addBatch({
        id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        label: source === 'interviews' ? 'Personas from interviews' : 'Generated personas',
        source,
        createdAt: new Date().toISOString(),
        personas: [],
        error: error?.trim() || 'The run failed without a message.',
        runId,
    })
}

function hasBatchForRun(runId: string): boolean {
    return usePersonaStore.getState().batches.some((b) => b.runId === runId)
}
