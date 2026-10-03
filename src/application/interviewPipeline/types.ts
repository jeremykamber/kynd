/**
 * Application-layer types for the interview → persona pipeline.
 * Pure data: no behavior.
 */

export interface ExtractedSignal {
  /** Normalized description of the signal */
  text: string;
  /** Exact verbatim quote from the transcript */
  quote: string;
  /** Reference to the source transcript segment */
  sourceSegmentId: string;
}

/** One interview's extracted signals, grouped by category. */
export interface ExtractedInterviewSignals {
  interviewId: string;
  painPoints: ExtractedSignal[];
  goals: ExtractedSignal[];
  values: ExtractedSignal[];
  featureDesires: ExtractedSignal[];
  decisionPatterns: ExtractedSignal[];
  context: {
    role?: string;
    industry?: string;
    teamSize?: string;
  };
  communicationStyle: string;
  salientQuotes: string[];
}

export interface WeightedItem {
  text: string;
  /** weight between 0 and 1 where 1 is most frequent/important */
  weight: number;
  sourceExamples: string[];
}

/**
 * Interview-wide aggregation produced by poolSignals. Every WeightedItem list
 * is sorted by descending weight; `totalInterviews` is the denominator those
 * weights were computed against.
 */
export interface PooledDistributionSummary {
  painPoints: WeightedItem[];
  goals: WeightedItem[];
  values: WeightedItem[];
  featureDesires: WeightedItem[];
  decisionPatterns: WeightedItem[];
  contextDistribution: {
    roles: WeightedItem[];
    industries: WeightedItem[];
  };
  communicationStyles: WeightedItem[];
  allSalientQuotes: string[];
  totalInterviews: number;
}

/**
 * One sampled persona blueprint. List fields hold several drawn signals.
 * Single-item fields (decisionPattern, context entries, communicationStyle)
 * are absent when the corresponding pool held nothing to draw:
 * `samplePersonas` refuses to emit a persona with no decision pattern at all
 * (see `InsufficientSignalError`), while role, industry, and communication
 * style may legitimately be missing and degrade to 'Unknown' in prompts.
 */
export interface SampledPersonaSignal {
  id: string;
  painPoints: ExtractedSignal[];
  goals: ExtractedSignal[];
  values: ExtractedSignal[];
  featureDesires: ExtractedSignal[];
  decisionPattern?: ExtractedSignal;
  context: {
    role?: WeightedItem;
    industry?: WeightedItem;
  };
  communicationStyle?: WeightedItem;
}
