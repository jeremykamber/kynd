import { TestingSession } from "@/domain/entities/TestingSession";
import { InteractionStep } from "@/domain/entities/InteractionStep";
import { IMemoryServicePort } from "@/domain/ports/IMemoryServicePort";

/**
 * Appends an interaction step to a testing session and refreshes the session's
 * short-term memory on every third appended step, so long-running analyses do
 * not grow the in-prompt history without bound.
 *
 * Stateless: the returned session is a new object with the step appended and
 * the memory summary possibly replaced; the input session is not mutated.
 */
export class RecordStepUseCase {
  constructor(private readonly memoryService: IMemoryServicePort) { }

  async execute(session: TestingSession, step: InteractionStep): Promise<TestingSession> {
    const updatedSteps = [...session.steps, step];

    let updatedMemory = session.shortTermMemory;

    if (updatedSteps.length > 0 && updatedSteps.length % 3 === 0) {
      console.log(`[RecordStepUseCase] Updating short-term memory at step ${updatedSteps.length}...`);
      updatedMemory = await this.memoryService.summarizeSteps(updatedSteps);
    }

    return {
      ...session,
      steps: updatedSteps,
      shortTermMemory: updatedMemory
    };
  }
}
