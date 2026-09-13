import { InteractionStep } from "./InteractionStep";

/**
 * A persona's live interaction session against an artifact: every step taken
 * so far plus the rolling "state of mind" summary derived from them.
 */
export interface TestingSession {
  id: string;
  personaId: string;
  steps: InteractionStep[];
  shortTermMemory: string;
}
