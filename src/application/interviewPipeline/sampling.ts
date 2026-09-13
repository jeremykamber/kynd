import type {
  ExtractedSignal,
  PooledDistributionSummary,
  SampledPersonaSignal,
  WeightedItem,
} from './types';

/**
 * Draws items by weighted random selection **without replacement** within a
 * single call: an item is drawn at most once, but the same item may appear in
 * draws made by separate calls (different personas). Items with larger
 * `weight` are more likely to be drawn first.
 *
 * The number of draws is chosen uniformly from `min`..`max` inclusive, then
 * capped at the number of available items.
 *
 * Non-deterministic (uses Math.random). Weights are assumed non-negative, as
 * WeightedItem specifies.
 *
 * @returns Between 0 and `Math.min(items.length, max)` items; empty when the
 *   input is empty, `min > max`, or every weight is <= 0.
 */
export function weightedDraw(
  items: WeightedItem[],
  min: number,
  max: number,
): WeightedItem[] {
  if (items.length === 0) return [];

  const desired = min + Math.floor(Math.random() * (max - min + 1));
  const count = Math.min(desired, items.length);
  if (count <= 0) return [];

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight <= 0) return [];

  const pool = [...items];
  const result: WeightedItem[] = [];

  for (let i = 0; i < count; i++) {
    const currentTotal = pool.reduce((sum, item) => sum + item.weight, 0);
    if (currentTotal <= 0) break;

    const threshold = Math.random() * currentTotal;
    let cumulative = 0;

    for (let j = 0; j < pool.length; j++) {
      cumulative += pool[j].weight;
      if (threshold <= cumulative) {
        result.push(pool[j]);
        pool.splice(j, 1);
        break;
      }
    }
  }

  return result;
}

function toExtractedSignal(item: WeightedItem): ExtractedSignal {
  return {
    text: item.text,
    quote:
      item.sourceExamples.length > 0
        ? item.sourceExamples[
            Math.floor(Math.random() * item.sourceExamples.length)
          ]
        : item.text,
    sourceSegmentId: 'sampled',
  };
}

function createPersonaSignal(
  distribution: PooledDistributionSummary,
  idx: number,
): SampledPersonaSignal {
  const painPoints = weightedDraw(distribution.painPoints, 2, 4).map(
    toExtractedSignal,
  );
  const goals = weightedDraw(distribution.goals, 1, 3).map(toExtractedSignal);
  const values = weightedDraw(distribution.values, 2, 4).map(toExtractedSignal);
  const featureDesires = weightedDraw(distribution.featureDesires, 1, 3).map(
    toExtractedSignal,
  );
  const decisionPattern = weightedDraw(distribution.decisionPatterns, 1, 1).map(
    toExtractedSignal,
  );
  const role = weightedDraw(distribution.contextDistribution.roles, 1, 1);
  const industry = weightedDraw(
    distribution.contextDistribution.industries,
    1,
    1,
  );
  const communicationStyle = weightedDraw(
    distribution.communicationStyles,
    1,
    1,
  );

  return {
    id: `sampled-${idx}`,
    painPoints,
    goals,
    values,
    featureDesires,
    decisionPattern: decisionPattern[0],
    context: {
      role: role[0],
      industry: industry[0],
    },
    communicationStyle: communicationStyle[0],
  };
}

/**
 * Sample `personaCount` personas from a pooled distribution summary using
 * weighted random draws with min/max ranges per category:
 *
 * | Category          | Min | Max |
 * |-------------------|-----|-----|
 * | painPoints        | 2   | 4   |
 * | goals             | 1   | 3   |
 * | values            | 2   | 4   |
 * | featureDesires    | 1   | 3   |
 * | decisionPattern   | 1   | 1   |
 * | context.role      | 1   | 1   |
 * | context.industry  | 1   | 1   |
 * | communicationStyle| 1   | 1   |
 *
 * After the initial sample, if `onValidate` is provided it receives all
 * `personaCount` personas and returns the indices of any that are
 * contradictory; those are resampled, up to 3 batch-level retries. If
 * contradictions remain after the retries, the latest sample is returned
 * as-is.
 *
 * Non-deterministic (uses Math.random). No LLM or I/O calls: coherence
 * checking is delegated entirely to the injected `onValidate` callback.
 *
 * @returns `personaCount` personas, or [] when `personaCount <= 0`.
 */
export async function samplePersonas(
  distribution: PooledDistributionSummary,
  personaCount: number,
  onValidate?: (
    personas: SampledPersonaSignal[],
  ) => Promise<number[]>,
): Promise<SampledPersonaSignal[]> {
  if (personaCount <= 0) return [];

  const personas: SampledPersonaSignal[] = [];
  for (let i = 0; i < personaCount; i++) {
    personas.push(createPersonaSignal(distribution, i));
  }

  if (onValidate) {
    let contradictoryIndices = await onValidate(personas);
    let retries = 0;
    const MAX_RETRIES = 3;

    while (contradictoryIndices.length > 0 && retries < MAX_RETRIES) {
      for (const idx of contradictoryIndices) {
        if (idx >= 0 && idx < personas.length) {
          personas[idx] = createPersonaSignal(distribution, idx);
        }
      }
      contradictoryIndices = await onValidate(personas);
      retries++;
    }
  }

  return personas;
}
