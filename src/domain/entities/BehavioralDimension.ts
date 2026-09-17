import { z } from "zod";

/**
 * A domain-specific behavioral axis of a persona — for example
 * "friction-tolerance" in a job-search study. Complements the universal Big
 * Five traits with axes that only make sense in one research context.
 */
export interface BehavioralDimension {
  name: string;
  /** 0-100, matching the Big Five scale. */
  score: number;
  /** The context that makes this axis meaningful (e.g. "job search"). */
  context: string;
  description: string;
  /** Support from the source material, when available. */
  evidence?: string;
}

export const BehavioralDimensionSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  context: z.string().min(1),
  description: z.string().min(1),
  evidence: z.string().optional(),
});
