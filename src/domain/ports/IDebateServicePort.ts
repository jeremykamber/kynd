import type { Persona } from "@/domain/entities/Persona";
import type { DebateStreamEvent } from "@/domain/entities/DebateRoom";

/**
 * Port for debate orchestration.
 * Implemented by DebateAdapter (infrastructure layer).
 * Depended upon by DebateUseCase (application layer).
 */
export interface IDebateServicePort {
  /**
   * Execute a multi-round, multi-persona debate.
   * Yields structured streaming events for the client to consume.
   *
   * Ordering guarantee: `debate_start` first, then per round `round_start`
   * → for each participant `persona_start`, zero or more `chunk`s (their
   * spoken text pieces in order), `persona_end` → `round_end`; `debate_end`
   * last. An `error` event ends the stream early and nothing follows it.
   *
   * A single participant's LLM failure is not fatal: that participant is
   * recorded as unavailable and the debate continues, so the stream still
   * reaches `debate_end`.
   *
   * @param proposal — The statement/proposal being debated
   * @param participants — 2-5 personas; speaking order per round
   * @param totalRounds — Number of rounds (default 3)
   * @returns An async stream of events for one debate; the iterable rejects
   *   only on orchestration failure, not on a participant failure.
   */
  executeDebate(
    proposal: string,
    participants: Persona[],
    totalRounds: number,
  ): AsyncIterable<DebateStreamEvent>;
}
