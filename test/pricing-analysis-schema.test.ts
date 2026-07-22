import { describe, it, expect } from 'vitest';
import {
  validatePricingAnalysis,
  PricingAnalysisSchema,
  type PricingAnalysis,
} from '../src/domain/entities/PricingAnalysis';

function buildValidAnalysis(overrides?: Partial<PricingAnalysis>): PricingAnalysis {
  return {
    id: 'test-1',
    url: 'https://example.com/pricing',
    screenshotBase64: 'base64data',
    thoughts:
      '[The Good] Clear pricing.\n[The Bad] No free tier.\n[The Dealbreaker] Annual lock-in.',
    scores: {
      clarity: 8,
      clarityReason: 'Clear layout',
      valuePerception: 7,
      valuePerceptionReason: 'Good value',
      trust: 6,
      trustReason: 'Decent',
      explorationIntent: 5,
      explorationIntentReason: 'Might look around',
      analysisIntent: 4,
      analysisIntentReason: 'Would compare first',
      buyIntent: 3,
      buyIntentReason: 'Not ready yet',
    },
    risks: ['Annual billing is a lock-in risk', 'No refund policy visible', 'Sync add-on feels overpriced'],
    recommendations: ['Add monthly billing option', 'Publish a clear refund policy'],
    aiSuggestion: 'As a small business owner, I\'d want to see a monthly billing option before committing.',
    ...overrides,
  };
}

describe('validatePricingAnalysis', () => {
  it('accepts a valid analysis', () => {
    expect(validatePricingAnalysis(buildValidAnalysis())).toBe(true);
  });

  it('rejects null', () => {
    expect(validatePricingAnalysis(null as any)).toBe(false);
  });

  it('rejects missing id', () => {
    const { id: _, ...rest } = buildValidAnalysis();
    expect(validatePricingAnalysis({ ...rest, id: '' } as any)).toBe(false);
  });

  it('rejects invalid url', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ url: 'not-a-url' }))).toBe(false);
  });

  it('accepts Screenshot Upload as url', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ url: 'Screenshot Upload' }))).toBe(true);
  });

  it('accepts uploaded:// prefix as url', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ url: 'uploaded://file.png' }))).toBe(true);
  });

  it('rejects empty thoughts', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ thoughts: '' }))).toBe(false);
  });

  it('rejects out-of-range scores', () => {
    const analysis = buildValidAnalysis();
    expect(validatePricingAnalysis({ ...analysis, scores: { ...analysis.scores, clarity: 11 } })).toBe(false);
  });

  it('rejects non-finite scores', () => {
    const analysis = buildValidAnalysis();
    expect(validatePricingAnalysis({ ...analysis, scores: { ...analysis.scores, clarity: NaN } })).toBe(false);
  });

  it('rejects empty risks array', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ risks: [] }))).toBe(true);
  });

  it('rejects non-string risks', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ risks: [123] as any }))).toBe(false);
  });

  it('rejects empty recommendations array', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ recommendations: [] }))).toBe(true);
  });

  it('rejects empty aiSuggestion', () => {
    expect(validatePricingAnalysis(buildValidAnalysis({ aiSuggestion: '' }))).toBe(false);
  });

  it('accepts missing optional gazePoints', () => {
    const { gazePoints, ...rest } = buildValidAnalysis();
    expect(validatePricingAnalysis(rest)).toBe(true);
  });

  it('accepts valid gazePoints', () => {
    expect(
      validatePricingAnalysis(
        buildValidAnalysis({
          gazePoints: [{ x: 50, y: 50, focusLabel: 'Price' }],
        }),
      ),
    ).toBe(true);
  });

  it('rejects invalid gazePoints', () => {
    expect(
      validatePricingAnalysis(
        buildValidAnalysis({
          gazePoints: [{ x: 'bad', y: 50, focusLabel: 'Price' }] as any,
        }),
      ),
    ).toBe(false);
  });
});

describe('PricingAnalysisSchema Zod parsing', () => {
  it('parses a valid raw object', () => {
    const raw = {
      gutReaction: 'Not bad, but the pricing feels off.',
      thoughts:
        '[The Good] The free tier is generous.\n[The Bad] The annual billing is a red flag.\n[The Dealbreaker] No monthly option for Sync.',
      scores: {
        clarity: 7,
        clarityReason: 'Layout is clear.',
        valuePerception: 5,
        valuePerceptionReason: 'Decent value.',
        trust: 6,
        trustReason: 'Looks trustworthy.',
        explorationIntent: 6,
        explorationIntentReason: 'Would click around.',
        analysisIntent: 4,
        analysisIntentReason: 'Would compare.',
        buyIntent: 3,
        buyIntentReason: 'Not ready.',
      },
      risks: ['Annual lock-in', 'No refund policy'],
      recommendations: ['Add monthly billing', 'Publish refund policy'],
      aiSuggestion: 'I\'d need a monthly option before committing.',
    };

    const result = PricingAnalysisSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = PricingAnalysisSchema.safeParse({ gutReaction: 'hi' });
    expect(result.success).toBe(false);
  });

  it('rejects scores outside 1-10 range', () => {
    const raw = {
      gutReaction: 'ok',
      thoughts: 'test',
      scores: {
        clarity: 0,
        clarityReason: 'x',
        valuePerception: 5,
        valuePerceptionReason: 'x',
        trust: 5,
        trustReason: 'x',
        explorationIntent: 5,
        explorationIntentReason: 'x',
        analysisIntent: 5,
        analysisIntentReason: 'x',
        buyIntent: 5,
        buyIntentReason: 'x',
      },
      risks: [],
      recommendations: [],
      aiSuggestion: 'test',
    };
    const result = PricingAnalysisSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe('Prompt framing alignment', () => {
  it('schema thoughts description references structured sections, not paragraphs', () => {
    const thoughtsDesc = PricingAnalysisSchema.shape.thoughts.description ?? '';
    expect(thoughtsDesc).toContain('[The Good]');
    expect(thoughtsDesc).toContain('[The Bad]');
    expect(thoughtsDesc).toContain('[The Dealbreaker]');
    expect(thoughtsDesc).not.toContain('exactly 2 paragraphs');
  });

  it('schema risks description references persona perspective', () => {
    const risksDesc = PricingAnalysisSchema.shape.risks.description ?? '';
    expect(risksDesc).toContain('persona');
    expect(risksDesc).toContain('perspective');
  });

  it('schema recommendations description says directed at company and prohibits self-advice', () => {
    const recsDesc = PricingAnalysisSchema.shape.recommendations.description ?? '';
    expect(recsDesc).toContain('AT THE COMPANY');
    expect(recsDesc).toContain('imperative');
    expect(recsDesc).toContain('NOT self-advice');
  });

  it('schema aiSuggestion description says persona voice and first-person', () => {
    const sugDesc = PricingAnalysisSchema.shape.aiSuggestion.description ?? '';
    expect(sugDesc).toContain('persona');
    expect(sugDesc).toContain('first-person');
  });
});
