/**
 * The five-stage cognitive journey a persona moves through when meeting an
 * artifact: what it thinks the artifact is, whether it understands it,
 * whether it believes it, whether it cares, and what it does next.
 *
 * `COGNITIVE_STAGES` is the canonical order and length; a response's journey
 * is only valid when it contains exactly these stages, in this order.
 */
export type CognitiveStage =
  | 'interpretation'
  | 'understanding'
  | 'belief'
  | 'motivation'
  | 'action';

export const COGNITIVE_STAGES: CognitiveStage[] = [
  'interpretation',
  'understanding',
  'belief',
  'motivation',
  'action',
];

/** Human-readable label for each stage. */
export const STAGE_LABELS: Record<CognitiveStage, string> = {
  interpretation: 'Interpretation',
  understanding: 'Understanding',
  belief: 'Belief',
  motivation: 'Motivation',
  action: 'Action',
};

/** The question the persona answers at each stage. */
export const STAGE_QUESTIONS: Record<CognitiveStage, string> = {
  interpretation: 'What do I think this is?',
  understanding: 'Do I understand it?',
  belief: 'Do I believe it?',
  motivation: 'Do I care enough?',
  action: 'What do I do?',
};
