import type {
  PooledDistributionSummary,
  ExtractedInterviewSignals,
  ExtractedSignal,
  WeightedItem,
} from "./types";
import { ngramFingerprint, cosineSimilarity } from "./ngramUtils";

interface SignalWithSource extends ExtractedSignal {
  interviewId: string;
}

interface SignalCluster {
  text: string;
  interviewIds: Set<string>;
  quotes: string[];
}

function clusterSignals(
  signals: SignalWithSource[],
  threshold: number,
): SignalCluster[] {
  const clusters: SignalCluster[] = [];

  for (const signal of signals) {
    const fp = ngramFingerprint(signal.text);
    let matched = false;

    for (const cluster of clusters) {
      const cfp = ngramFingerprint(cluster.text);
      if (cosineSimilarity(fp, cfp) >= threshold) {
        cluster.interviewIds.add(signal.interviewId);
        cluster.quotes.push(signal.quote);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push({
        text: signal.text,
        interviewIds: new Set([signal.interviewId]),
        quotes: [signal.quote],
      });
    }
  }

  return clusters;
}

function poolSignalCategory(
  allExtractions: ExtractedInterviewSignals[],
  extractor: (s: ExtractedInterviewSignals) => readonly ExtractedSignal[],
  threshold: number,
): WeightedItem[] {
  const totalInterviews = allExtractions.length;
  if (totalInterviews === 0) return [];

  const allSignals: SignalWithSource[] = allExtractions.flatMap((e) =>
    extractor(e).map((s: ExtractedSignal) => ({ ...s, interviewId: e.interviewId })),
  );
  if (allSignals.length === 0) return [];

  const clusters = clusterSignals(allSignals, threshold);

  return clusters
    .map((c) => ({
      text: c.text,
      weight: c.interviewIds.size / totalInterviews,
      sourceExamples: c.quotes.slice(0, 3),
    }))
    .sort((a, b) => b.weight - a.weight);
}

function aggregateStringItems(
  items: string[],
  totalInterviews: number,
): WeightedItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([text, count]) => ({
      text,
      weight: count / totalInterviews,
      sourceExamples: [],
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Pools every interview's signals into one distribution summary.
 *
 * Signals within a category are clustered greedily by trigram cosine
 * similarity: a signal joins the first cluster whose representative text is at
 * least `threshold` similar, otherwise it starts a new cluster. Each item's
 * `weight` is the fraction of interviews that contributed at least one signal
 * to its cluster (0..1), and `sourceExamples` holds up to 3 verbatim quotes
 * from the cluster. String-valued fields (roles, industries, communication
 * styles) are pooled by exact-match frequency instead of similarity.
 *
 * Deterministic for a fixed input order; every category is sorted by
 * descending weight. An empty input returns a summary with empty categories
 * and `totalInterviews: 0`.
 *
 * @param threshold Cosine-similarity cutoff in [0, 1] above which two signals
 *   are considered the same (default 0.7).
 */
export function poolSignals(
  allExtractions: ExtractedInterviewSignals[],
  threshold = 0.7,
): PooledDistributionSummary {
  const totalInterviews = allExtractions.length;

  return {
    painPoints: poolSignalCategory(allExtractions, (s) => s.painPoints, threshold),
    goals: poolSignalCategory(allExtractions, (s) => s.goals, threshold),
    values: poolSignalCategory(allExtractions, (s) => s.values, threshold),
    featureDesires: poolSignalCategory(allExtractions, (s) => s.featureDesires, threshold),
    decisionPatterns: poolSignalCategory(allExtractions, (s) => s.decisionPatterns, threshold),

    contextDistribution: {
      roles: aggregateStringItems(
        allExtractions.map((e) => e.context.role).filter((r): r is string => r !== undefined),
        totalInterviews,
      ),
      industries: aggregateStringItems(
        allExtractions.map((e) => e.context.industry).filter((r): r is string => r !== undefined),
        totalInterviews,
      ),
    },

    communicationStyles: aggregateStringItems(
      allExtractions.map((e) => e.communicationStyle).filter(Boolean),
      totalInterviews,
    ),

    allSalientQuotes: allExtractions.flatMap((e) => e.salientQuotes),
    totalInterviews,
  };
}
