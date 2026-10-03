import { InteractionStep } from "../entities/InteractionStep";

/**
 * Summarizes a persona's raw interaction history into a short "state of mind"
 * used to ground the next prompt.
 */
export interface IMemoryServicePort {
  /**
   * Condenses `steps` (in chronological order) into a brief summary of what
   * the persona has learned and what it is currently looking for.
   * @returns The summary text; rejects on model failure.
   */
  summarizeSteps(steps: InteractionStep[]): Promise<string>;
}
