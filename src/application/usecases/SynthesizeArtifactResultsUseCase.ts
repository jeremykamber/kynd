import type { ArtifactSynthesis } from "@/domain/entities/ArtifactSynthesis";
import type { SynthesisPlan } from "@/domain/entities/SynthesisPlan";
import type { LlmServicePort } from "@/domain/ports/LlmServicePort";
import { buildArtifactSynthesis, planForWriter } from "@/application/synthesis/plan";
import { validateSynthesis } from "@/application/synthesis/validateSynthesis";

/**
 * Cross-persona cohort synthesis from a code-built plan.
 *
 * The writer receives the verified ledger and never a raw transcript. It
 * returns wording keyed by group id; code joins that wording to the ledger's
 * counts and citations. The validator then proves the assembled report did not
 * drift. One repair attempt follows; if it still fails, the draft is kept with
 * inline warnings instead of being replaced by a plain fallback.
 */
export class SynthesizeArtifactResultsUseCase {
  constructor(private readonly llmService: LlmServicePort) {}

  async execute(plan: SynthesisPlan, options?: { runId?: string }): Promise<ArtifactSynthesis> {
    const writerPlan = planForWriter(plan);
    const draft = await this.llmService.synthesizeFromPlan(writerPlan, options);
    let synthesis = buildArtifactSynthesis(plan, draft);
    let violations = validateSynthesis(plan, synthesis);

    if (violations.length > 0) {
      let repaired = draft;
      try {
        repaired = await this.llmService.repairSynthesis(
          writerPlan,
          draft,
          violations.map((violation) => `${violation.field}: ${violation.message}`),
          options,
        );
      } catch {
        // A failed repair is not a second failure of the draft: keep the draft,
        // mark the fields, and let the reader see exactly what failed.
        repaired = draft;
      }
      synthesis = buildArtifactSynthesis(plan, repaired);
      violations = validateSynthesis(plan, synthesis);
    }

    if (violations.length > 0) {
      synthesis = {
        ...synthesis,
        validationWarnings: violations.map((violation) => `${violation.field}: ${violation.message}`),
      };
    } else {
      // The summary sees only the built report: every finding, count, and
      // friction is already verified, so it cannot introduce a topic or a
      // group the writer never supported. A summary that fails validation is
      // discarded in favour of the draft that already passed.
      try {
        const summary = await this.llmService.summarizeReport(plan, synthesis, options);
        const candidate = { ...synthesis, ...summary };
        if (validateSynthesis(plan, candidate).length === 0) synthesis = candidate;
      } catch {
        // Keeping the validated draft is honest: the report is still complete,
        // and a failed summary call must not erase it.
      }
    }

    return synthesis;
  }
}
