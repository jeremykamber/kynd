import { ExtractedInterviewSignals, ExtractedSignal } from "./types";
import { Chunk } from "@/infrastructure/adapters/IdRagStore";

type SignalCategoryKey =
  | "painPoints"
  | "goals"
  | "values"
  | "featureDesires"
  | "decisionPatterns";

const SIGNAL_TYPE_MAP: Record<SignalCategoryKey, string> = {
  painPoints: "pain_point",
  goals: "goal",
  values: "value",
  featureDesires: "feature_desire",
  decisionPatterns: "decision_pattern",
};

/**
 * Converts one interview's extracted signals into IdRagStore chunks.
 *
 * Emits, in order: one chunk per signal item per category (pain points, goals,
 * values, feature desires, decision patterns) whose text is that item's
 * verbatim quote; one `salient_quote` chunk per untyped salient quote; and
 * finally one `interview_summary` chunk holding the context, communication
 * style, and per-category counts. Chunk ids embed `personaId` and a per-kind
 * index, so identical arguments always produce identical ids.
 *
 * Empty or missing categories contribute nothing; an input with no signals
 * still yields the single summary chunk.
 */
export function chunkInterviewSignals(
  signals: ExtractedInterviewSignals,
  personaId: string,
): Chunk[] {
  const chunks: Chunk[] = [];

  function pushSignalChunk(category: SignalCategoryKey, item: ExtractedSignal, idx: number) {
    const signalType = SIGNAL_TYPE_MAP[category];

    const chunk: Chunk = {
      id: `chunk-${personaId}-interview-${signalType}-${idx}`,
      personaId,
      text: item.quote,
      chunkType: "interview",
      metadata: {
        sourceInterviewId: signals.interviewId,
        sourceSegmentId: item.sourceSegmentId,
        signalType,
        topic: signalType,
      },
    };

    chunks.push(chunk);
  }

  const categories: SignalCategoryKey[] = [
    "painPoints",
    "goals",
    "values",
    "featureDesires",
    "decisionPatterns",
  ];

  for (const category of categories) {
    const items: ExtractedSignal[] | undefined = signals[category];
    if (!items || items.length === 0) continue;

    for (let i = 0; i < items.length; i++) {
      pushSignalChunk(category, items[i], i);
    }
  }

  if (Array.isArray(signals.salientQuotes)) {
    for (let i = 0; i < signals.salientQuotes.length; i++) {
      const quote = signals.salientQuotes[i];
      const chunk: Chunk = {
        id: `chunk-${personaId}-interview-salient_quote-${i}`,
        personaId,
        text: quote,
        chunkType: "interview",
        metadata: {
          sourceInterviewId: signals.interviewId,
          signalType: "salient_quote",
          topic: "salient_quote",
        },
      };
      chunks.push(chunk);
    }
  }

  const summaryText = JSON.stringify(
    {
      context: signals.context,
      communicationStyle: signals.communicationStyle,
    },
    null,
    2,
  );

  const summaryChunk: Chunk = {
    id: `chunk-${personaId}-interview-summary-0`,
    personaId,
    text: summaryText,
    chunkType: "interview",
    metadata: {
      sourceInterviewId: signals.interviewId,
      signalType: "interview_summary",
      topic: "interview_summary",
      // include counts of extracted signals to help retrieval filtering
      counts: {
        painPoints: signals.painPoints?.length ?? 0,
        goals: signals.goals?.length ?? 0,
        values: signals.values?.length ?? 0,
        featureDesires: signals.featureDesires?.length ?? 0,
        decisionPatterns: signals.decisionPatterns?.length ?? 0,
        salientQuotes: signals.salientQuotes?.length ?? 0,
      },
    },
  };

  chunks.push(summaryChunk);

  return chunks;
}
