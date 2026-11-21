import type { ArtifactInput } from "@/domain/entities/ArtifactInput";
import type { ArtifactIntake } from "@/domain/entities/ArtifactIntake";

/** Coarse intake stages, reported in this order. */
export type IntakeProgress = "NAVIGATING" | "CAPTURING" | "PROCESSING" | "COMPLETE";

export type IntakeProgressCallback = (progress: IntakeProgress) => void;

/**
 * Turns what the user submitted — a URL, an uploaded screenshot, or
 * already-extracted document text — into the normalized {@link ArtifactIntake}
 * the analysis consumes.
 *
 * `ArtifactIntakeAdapter` implements this with Playwright and the LLM. The use
 * cases depend on this contract alone, so they carry no reference to those
 * adapters.
 */
export interface ArtifactIntakePort {
  /**
   * @param input - What the caller submitted.
   * @param onProgress - Called at each stage; optional.
   * @param runId - Analysis run to log this intake under; unset calls are not
   *   traced.
   * @returns The normalized intake. A URL intake returns before its page
   *   summary is ready; the summary rides on `summaryPromise`.
   * @throws When the artifact cannot be read (browser failure, or text outside
   *   {@link ArtifactIntakeLimits}).
   */
  intake(
    input: ArtifactInput,
    onProgress?: IntakeProgressCallback,
    runId?: string,
  ): Promise<ArtifactIntake>;
}
