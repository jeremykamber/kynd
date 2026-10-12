/**
 * How the app watches a persona run.
 *
 * A run is observed from more than one place — the app-wide toast, the page
 * that started it, and /dashboard/generating/<runId> — and every observation is
 * a pair of server-action POSTs. Each surface polling on its own timer is what
 * produced the audit's 2.7 POSTs/second storm: three overlapping timers
 * (1s, 1s, 2s), none of them awaiting the previous round trip, so slow calls
 * stacked on top of each other. The cadence, the single-flight fetch, the
 * stall watchdog and the user-facing status text therefore live here, and every
 * surface goes through them.
 *
 * The contract:
 *
 * - **One cadence.** `PERSONA_RUN_POLL_INTERVAL_MS` is the fastest anything
 *   polls a run. `startPersonaRunPolling` is the only timer callers create, and
 *   it never starts a second round trip while one is in flight.
 * - **One round trip per cadence per run, app-wide.** The fetches are gated per
 *   run: callers inside the window get the last answer, callers arriving while
 *   a fetch is in flight await that same promise. Three mounted surfaces cost
 *   exactly as many POSTs as one.
 * - **One terminal story.** A run that reports nothing new for
 *   `PERSONA_RUN_STALL_MS` is stalled. `observePersonaRun` says so once for
 *   every observer, so the toast and the progress page can never disagree about
 *   whether a run is still alive.
 * - **Retries are internal.** The pipeline's "we ran into an issue … retrying"
 *   chatter is a transient implementation detail, not user-facing state: it is
 *   logged and replaced with the step's neutral label.
 */

import {
  getPersonaGenerationResultAction,
  type PersonaGenerationResult,
} from '@/actions/getPersonaGenerationResult'
import { getProgressAction, type ProgressState } from '@/actions/getProgress'

/**
 * The fastest any surface polls a run. Long runs take 1–4 minutes and the
 * server actions round-trip to the VPS, so a cadence below a couple of seconds
 * buys nothing but load; 3s keeps a single run under ~0.7 requests/second.
 */
export const PERSONA_RUN_POLL_INTERVAL_MS = 3000

/**
 * How long a run may report nothing new before it is treated as dead. Runs
 * finish in 49–231s and report step and per-persona count changes throughout,
 * so four minutes of silence means the pipeline stopped reporting — the state
 * the audit found waiting forever with no error, no timeout and no way out.
 */
export const PERSONA_RUN_STALL_MS = 240_000

/** Terminal message for a run that went quiet. */
export const PERSONA_RUN_STALLED_MESSAGE = 'This run stalled. Try again.'

/**
 * Deterministic toast id per run, so any number of observers still render one
 * toast per run (sonner dedupes by id).
 */
export const personaRunToastId = (runId: string) => `persona-toast-${runId}`

/**
 * The moment a run started, when its id says so: the VPS-side pipelines stamp
 * `Date.now()` into the id (`pi-1791834981801-ab12`, `pt-…`). The toast's
 * elapsed clock uses it, so a run opened after a reload still reports the time
 * it has really been running. Locally streamed runs use a base36 stamp, which
 * this does not match — their clocks fall back to when a surface first saw them.
 */
const RUN_ID_START = /-(1[0-9]{12})-/

export function runStartedAt(runId: string): number | null {
  const match = RUN_ID_START.exec(runId)
  return match ? Number(match[1]) : null
}

export interface PersonaRunObservation {
  /** Set once the run's result has been stored (completed or failed). */
  result?: PersonaGenerationResult
  /** Latest progress the run reported, if it has reported any. */
  progress?: ProgressState
  /** True once the run has reported nothing new for `PERSONA_RUN_STALL_MS`. */
  stalled: boolean
}

interface GatedFetch<T> {
  at: number
  value: T | null
  inflight: Promise<T> | null
}

const resultFetches = new Map<string, GatedFetch<PersonaGenerationResult>>()
const progressFetches = new Map<string, GatedFetch<{ found: boolean; progress?: ProgressState }>>()

/**
 * Runs `fetcher` at most once per cadence per run, sharing one promise between
 * concurrent callers and reusing the last answer inside the window. `fresh`
 * marks values that never need re-fetching — a stored result, a finished or
 * failed progress entry.
 */
function gatedFetch<T>(
  runId: string,
  state: Map<string, GatedFetch<T>>,
  fetcher: (runId: string) => Promise<T>,
  fresh: (value: T) => boolean,
): Promise<T> {
  const entry = state.get(runId) ?? { at: 0, value: null, inflight: null }
  state.set(runId, entry)

  if (entry.value !== null && fresh(entry.value)) return Promise.resolve(entry.value)
  if (entry.inflight) return entry.inflight
  if (entry.value !== null && Date.now() - entry.at < PERSONA_RUN_POLL_INTERVAL_MS) {
    return Promise.resolve(entry.value)
  }

  entry.inflight = fetcher(runId).then(
    (value) => {
      entry.value = value
      entry.at = Date.now()
      entry.inflight = null
      return value
    },
    (error) => {
      entry.inflight = null
      throw error
    },
  )
  return entry.inflight
}

interface StallWatch {
  signature: string
  since: number
  stalled: boolean
}

const stallWatches = new Map<string, StallWatch>()

/**
 * What the run has told us, as one string. Any change — step, counts, status
 * text, completion or failure — counts as progress.
 */
function progressSignature(found: boolean, progress?: ProgressState): string {
  if (!found) return 'not-reported'
  return [
    progress?.step ?? '',
    progress?.completedCount ?? progress?.completedResponses ?? '',
    progress?.totalCount ?? progress?.totalResponses ?? '',
    progress?.streamingText ?? '',
    progress?.hasCompleted ? 'done' : '',
    progress?.error ? 'error' : '',
  ].join('|')
}

/**
 * Records what the run just reported and answers whether it is stalled. One
 * watch per run is shared by every observer: a page reopening the same run
 * cannot restart the clock, and the first observer to see the timeout does not
 * consume it for the others.
 */
function watchForStall(runId: string, found: boolean, progress?: ProgressState): boolean {
  const signature = progressSignature(found, progress)
  const watch = stallWatches.get(runId) ?? { signature, since: Date.now(), stalled: false }

  if (watch.signature !== signature) {
    watch.signature = signature
    watch.since = Date.now()
    watch.stalled = false
  } else if (!watch.stalled && Date.now() - watch.since >= PERSONA_RUN_STALL_MS) {
    watch.stalled = true
    console.warn(
      `[persona-run] ${runId} reported nothing new for ${Math.round(PERSONA_RUN_STALL_MS / 1000)}s — treating it as stalled (last: ${signature})`,
    )
  }

  stallWatches.set(runId, watch)
  return watch.stalled
}

/**
 * Runs whose last poll failed. A backend that has gone away is one log line per
 * run, not one per cadence — the audit's console was flooded with 500 entries
 * of exactly that.
 */
const failingPolls = new Set<string>()

function notePollFailure(runId: string, what: string, error: unknown): void {
  if (failingPolls.has(runId)) return
  failingPolls.add(runId)
  console.error(`[persona-run] ${what} poll failed for ${runId}; further failures are not logged`, error)
}

/**
 * The run's current state: its result when it has settled, otherwise its
 * progress plus a verdict on whether it has gone quiet. Safe to call from any
 * number of surfaces — the round trips behind it are shared.
 *
 * A poll that fails counts as a poll that reported nothing: the stall clock
 * keeps running, so a run whose backend stopped answering still reaches its
 * terminal state instead of reporting "in progress" forever.
 */
export async function observePersonaRun(runId: string): Promise<PersonaRunObservation> {
  let result: PersonaGenerationResult
  try {
    result = await gatedFetch(
      runId,
      resultFetches,
      getPersonaGenerationResultAction,
      (value) => value.found,
    )
  } catch (error) {
    notePollFailure(runId, 'result', error)
    return { stalled: watchForStall(runId, false, undefined) }
  }

  failingPolls.delete(runId)
  // A stored result is the run's outcome; there is nothing left to watch.
  if (result.found) return { result, stalled: false }

  let progress: { found: boolean; progress?: ProgressState }
  try {
    progress = await gatedFetch(
      runId,
      progressFetches,
      getProgressAction,
      (value) => !!value.progress?.error || !!value.progress?.hasCompleted,
    )
  } catch (error) {
    notePollFailure(runId, 'progress', error)
    return { stalled: watchForStall(runId, false, undefined) }
  }

  const state = progress.found ? progress.progress : undefined
  return { progress: state, stalled: watchForStall(runId, progress.found, state) }
}

/**
 * Drops everything cached for a run. Called when a run settles, so a settled
 * run stops costing anything and a later run id cannot read its answers.
 */
export function forgetPersonaRun(runId: string): void {
  resultFetches.delete(runId)
  progressFetches.delete(runId)
  stallWatches.delete(runId)
  failingPolls.delete(runId)
}

/**
 * Starts the one polling timer a surface is allowed: an immediate tick, then
 * one per cadence, and never a tick while the previous one is still running —
 * a slow round trip used to overlap itself, which is how one run's polling
 * reached 2.7 POSTs/second. Returns the stop function.
 */
export function startPersonaRunPolling(tick: () => Promise<void>): () => void {
  let running = false

  const run = async () => {
    if (running) return
    running = true
    try {
      await tick()
    } catch (error) {
      // A round trip can fail without the run being wrong; the next tick
      // retries. Without this, the interval's promise rejected unhandled and
      // flooded the console.
      console.error('[persona-run] poll failed', error)
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(run, PERSONA_RUN_POLL_INTERVAL_MS)
  return () => clearInterval(timer)
}

const STEP_DISPLAY: Record<string, string> = {
  BRAINSTORMING_PERSONAS: 'Brainstorming personas',
  GENERATING_BACKSTORIES: 'Generating backstories',
  // Same old-name alias as STEP_PROGRESS.
  ENHANCING_WITH_PBJ: 'Adding behavioral depth',
  ADDING_BEHAVIORAL_DEPTH: 'Adding behavioral depth',
  GENERATING_INSIGHTS: 'Generating insights',
  // Long-form keys (ICP pipeline)
  EXTRACTING_SIGNALS: 'Extracting signals from interviews',
  POOLING_SIGNALS: 'Pooling signals across interviews',
  SAMPLING_PERSONAS: 'Sampling persona profiles',
  INGESTING_TO_MEMORY: 'Indexing personas for chat',
  // Short-form keys (interview pipeline — server emits these)
  EXTRACTING: 'Extracting signals from interviews',
  POOLING: 'Pooling signals across interviews',
  SAMPLING: 'Sampling persona profiles',
  GENERATING: 'Generating personas',
  INGESTING: 'Indexing personas for chat',
  DONE: 'Complete',
  ERROR: 'Error',
}

/** Human label for a pipeline step. */
export function formatRunStepName(step?: string): string {
  if (!step) return 'Generating personas...'
  return (
    STEP_DISPLAY[step] ??
    step
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase())
  )
}

/**
 * Pipeline statuses that are not progress the user should read: a retry it is
 * about to resolve itself. The audit caught one of these rendered as the run's
 * subtitle — "We ran into an issue generating the personas, so we're
 * retrying." — on a run that then succeeded, and beside a success panel.
 */
const TRANSIENT_STATUS = /retry|retrying|trying again|ran into an issue|attempt\s+\d/i

/**
 * The line a run shows under its title: its own status text when it has one,
 * the neutral step label when the text is transient retry chatter (logged, not
 * surfaced) or missing.
 */
export function runStatusText(progress?: ProgressState): string {
  const label = formatRunStepName(progress?.step)
  const text = progress?.streamingText?.trim()
  if (!text) return label
  if (!TRANSIENT_STATUS.test(text)) return text
  console.debug(`[persona-run] internal status not surfaced: ${text}`)
  return label
}
