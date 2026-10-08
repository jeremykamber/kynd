import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { usePersonaStore } from '@/ui/stores/personaStore'
import type { Persona } from '@/domain/entities/Persona'

// Naming is one cheap model call; the module's job is to make it happen once.
const generateBatchTitleAction = vi.fn(
  async (_personas: unknown, _context: unknown) => ({ title: null as string | null }),
)

vi.mock('@/actions/generateBatchTitleAction', () => ({
  generateBatchTitleAction: (personas: unknown, context: unknown) =>
    generateBatchTitleAction(personas, context),
}))

import { persistPersonaBatchForRun, recordFailedPersonaBatch, sourceOf } from '../personaRunOutcome'

const persona = (id: string): Persona => ({ id, name: id, personas: undefined } as unknown as Persona)

beforeEach(() => {
  generateBatchTitleAction.mockClear()
  generateBatchTitleAction.mockResolvedValue({ title: null })
  usePersonaStore.setState({ batches: [], activeBatchId: null, activeGenerationRunIds: [] })
})

afterEach(() => {
  usePersonaStore.setState({ batches: [] })
})

describe('persistPersonaBatchForRun', () => {
  it('falls back to the caller label when the model returns no title', async () => {
    const batch = await persistPersonaBatchForRun({
      runId: 'pt-1',
      personas: [persona('p1')],
      source: 'description',
      fallbackLabel: '3 Personas from a description',
    })

    expect(batch?.label).toBe('3 Personas from a description')
    expect(usePersonaStore.getState().batches).toHaveLength(1)
  })

  it('uses the model title when there is one', async () => {
    generateBatchTitleAction.mockResolvedValueOnce({ title: 'Nordic public-sector buyers' })

    const batch = await persistPersonaBatchForRun({
      runId: 'pt-2',
      personas: [persona('p1')],
      source: 'description',
      fallbackLabel: 'fallback',
    })

    expect(batch?.label).toBe('Nordic public-sector buyers')
  })

  it('writes one batch when two observers settle the same run at once', async () => {
    const outcome = {
      runId: 'pi-1',
      personas: [persona('p1')],
      source: 'interviews' as const,
      fallbackLabel: 'fallback',
    }

    // Both observers resolve before either has written anything.
    const [first, second] = await Promise.all([
      persistPersonaBatchForRun(outcome),
      persistPersonaBatchForRun(outcome),
    ])

    expect(usePersonaStore.getState().batches).toHaveLength(1)
    expect(generateBatchTitleAction).toHaveBeenCalledTimes(1)
    // The loser is told nothing was written, so it cannot navigate to a batch
    // that does not exist.
    expect([first, second].filter(Boolean)).toHaveLength(1)
  })

  it('ignores a second observer that arrives after the run settled', async () => {
    const outcome = {
      runId: 'pi-2',
      personas: [persona('p1')],
      source: 'interviews' as const,
      fallbackLabel: 'fallback',
    }

    expect(await persistPersonaBatchForRun(outcome)).toBeTruthy()
    expect(await persistPersonaBatchForRun(outcome)).toBeNull()
    expect(usePersonaStore.getState().batches).toHaveLength(1)
  })

  it('keeps the run id on the batch, which is what stops the second write', async () => {
    const batch = await persistPersonaBatchForRun({
      runId: 'pi-3',
      personas: [persona('p1')],
      source: 'interviews',
      fallbackLabel: 'fallback',
    })

    expect(batch?.runId).toBe('pi-3')
  })

  it('still writes a batch when the caller has no run id', async () => {
    // A local run that returns no id has exactly one observer, so there is
    // nothing to arbitrate; the batch used to be dropped entirely here.
    const batch = await persistPersonaBatchForRun({
      personas: [persona('p1')],
      source: 'description',
      fallbackLabel: 'local run',
    })

    expect(batch?.label).toBe('local run')
    expect(usePersonaStore.getState().batches).toHaveLength(1)
  })
})

describe('recordFailedPersonaBatch', () => {
  it('records a failed run once, with the error text and no personas', () => {
    recordFailedPersonaBatch('pi-4', '  the pipeline died  ')
    recordFailedPersonaBatch('pi-4', 'the pipeline died')

    const batches = usePersonaStore.getState().batches
    expect(batches).toHaveLength(1)
    expect(batches[0].personas).toEqual([])
    expect(batches[0].error).toBe('the pipeline died')
    expect(batches[0].source).toBe('interviews')
  })

  it('stands in for a missing error message', () => {
    recordFailedPersonaBatch('pt-9', '   ')

    expect(usePersonaStore.getState().batches[0].error).toBe('The run failed without a message.')
    expect(usePersonaStore.getState().batches[0].label).toBe('Generated personas')
  })

  it('leaves a run that already produced a batch alone', async () => {
    await persistPersonaBatchForRun({
      runId: 'pi-5',
      personas: [persona('p1')],
      source: 'interviews',
      fallbackLabel: 'fallback',
    })

    recordFailedPersonaBatch('pi-5', 'too late')

    expect(usePersonaStore.getState().batches).toHaveLength(1)
    expect(usePersonaStore.getState().batches[0].error).toBeUndefined()
  })
})

describe('sourceOf', () => {
  it('reads the pipeline from the run id prefix', () => {
    expect(sourceOf('pt-abc')).toBe('description')
    expect(sourceOf('pi-abc')).toBe('interviews')
  })
})
