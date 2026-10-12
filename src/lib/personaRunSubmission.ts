/**
 * Re-running an interview persona generation.
 *
 * A run that fails has nothing left to retry server-side: the pipeline is gone
 * and the VPS only knows its id (there is no "restart this run" endpoint). The
 * inputs are the only thing that can bring it back, and they live in the page
 * that submitted them — which is exactly the page the user has usually left by
 * the time the toast reports the failure.
 *
 * So the submitting hook hands the inputs here, keyed by run id, and the
 * terminal toast's Retry submits them again. The memory is per tab and dropped
 * when the run settles: a retry after a reload is not offered (the toast shows
 * no Retry) rather than offered and then failing.
 *
 * The FormData is built here too, so a retry sends byte-for-byte the request
 * the first attempt sent.
 */

import { generatePersonasFromInterviewsAction } from '@/actions/generatePersonasFromInterviews'
import { usePersonaStore } from '@/ui/stores/personaStore'

/** One transcript, as the pipeline receives it. */
export interface InterviewTranscript {
  name: string
  content: string
}

/** Everything a generation request needs, apart from the transcripts' ids. */
export interface InterviewRunInput {
  transcripts: InterviewTranscript[]
  personaCount: number
  mode: 'individual' | 'synthesized'
}

/** The multipart body both the first attempt and a retry send. */
export function buildInterviewFormData(input: InterviewRunInput): FormData {
  const formData = new FormData()
  for (const transcript of input.transcripts) {
    const blob = new Blob([transcript.content], { type: 'text/plain' })
    formData.append('files', blob, transcript.name)
  }
  formData.append('count', String(input.personaCount))
  formData.append('mode', input.mode)
  return formData
}

const inputsByRunId = new Map<string, InterviewRunInput>()

/** Keeps a submitted run's inputs so a later failure can be retried. */
export function rememberInterviewRun(runId: string, input: InterviewRunInput): void {
  inputsByRunId.set(runId, input)
}

/** Whether a retry can be offered for this run (same tab, inputs still known). */
export function canRetryInterviewRun(runId: string): boolean {
  return inputsByRunId.has(runId)
}

/** Forgets a run's inputs: its toast was dismissed, or its retry has started. */
export function forgetInterviewRunInput(runId: string): void {
  inputsByRunId.delete(runId)
}

/**
 * Submits a run's inputs again as a new run, and starts tracking it. Resolves
 * with the new run id, or null when the inputs are no longer known (a reload,
 * or a run this tab did not start).
 */
export async function retryInterviewRun(runId: string): Promise<string | null> {
  const input = inputsByRunId.get(runId)
  if (!input) return null

  const result: { runId?: string } = await generatePersonasFromInterviewsAction(
    buildInterviewFormData(input),
  )
  const retryRunId = result.runId
  if (!retryRunId) return null

  inputsByRunId.set(retryRunId, input)
  usePersonaStore.getState().addActiveGeneration(retryRunId)
  return retryRunId
}
