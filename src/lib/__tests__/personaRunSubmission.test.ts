import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePersonaStore } from '@/ui/stores/personaStore'
import {
  buildInterviewFormData,
  canRetryInterviewRun,
  forgetInterviewRunInput,
  rememberInterviewRun,
  retryInterviewRun,
  type InterviewRunInput,
} from '../personaRunSubmission'

// A failed run cannot be restarted server-side, so a retry has to send the same
// request again. These tests pin the two halves of that: the multipart body is
// built the same way every time, and the inputs behind it are only kept for the
// runs this tab actually started.

const startGeneration = vi.fn(async (_formData: FormData) => ({ runId: 'retried-run' }))

vi.mock('@/actions/generatePersonasFromInterviews', () => ({
  generatePersonasFromInterviewsAction: (formData: FormData) => startGeneration(formData),
}))

const input: InterviewRunInput = {
  transcripts: [
    { name: 'ada.txt', content: 'interview one' },
    { name: 'grace.txt', content: 'interview two' },
  ],
  personaCount: 4,
  mode: 'synthesized',
}

beforeEach(() => {
  startGeneration.mockClear()
  startGeneration.mockImplementation(async () => ({ runId: 'retried-run' }))
  for (const runId of ['failed-run', 'retried-run', 'unknown-run']) {
    forgetInterviewRunInput(runId)
    usePersonaStore.getState().removeActiveGeneration(runId)
  }
})

describe('buildInterviewFormData', () => {
  it('sends one file per transcript, plus the count and the mode', async () => {
    const formData = buildInterviewFormData(input)

    const files = formData.getAll('files')
    expect(files).toHaveLength(2)
    expect(await (files[0] as Blob).text()).toBe('interview one')
    expect(await (files[1] as Blob).text()).toBe('interview two')
    expect(formData.get('count')).toBe('4')
    expect(formData.get('mode')).toBe('synthesized')
  })
})

describe('retryInterviewRun', () => {
  it('resubmits the remembered inputs and tracks the new run', async () => {
    rememberInterviewRun('failed-run', input)
    expect(canRetryInterviewRun('failed-run')).toBe(true)

    const retryRunId = await retryInterviewRun('failed-run')

    expect(retryRunId).toBe('retried-run')
    expect(startGeneration).toHaveBeenCalledTimes(1)

    const submitted = startGeneration.mock.calls[0][0]
    expect(submitted.get('count')).toBe('4')
    expect(submitted.getAll('files')).toHaveLength(2)

    // The retry is a run like any other: tracked, and itself retryable.
    expect(usePersonaStore.getState().activeGenerationRunIds).toContain('retried-run')
    expect(canRetryInterviewRun('retried-run')).toBe(true)

    usePersonaStore.getState().removeActiveGeneration('retried-run')
    forgetInterviewRunInput('retried-run')
  })

  it('refuses a run whose inputs are no longer known, without submitting', async () => {
    expect(canRetryInterviewRun('unknown-run')).toBe(false)

    expect(await retryInterviewRun('unknown-run')).toBeNull()
    expect(startGeneration).not.toHaveBeenCalled()
  })

  it('reports nothing to retry when the action returns no run id', async () => {
    rememberInterviewRun('failed-run', input)
    startGeneration.mockImplementationOnce(async () => ({ runId: '' }))

    expect(await retryInterviewRun('failed-run')).toBeNull()
    expect(usePersonaStore.getState().activeGenerationRunIds).not.toContain('retried-run')
  })
})
