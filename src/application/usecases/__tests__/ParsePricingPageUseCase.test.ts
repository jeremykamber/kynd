import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { ParsePricingPageUseCase } from '../ParsePricingPageUseCase';
import { BrowserServicePort } from '@/domain/ports/BrowserServicePort';
import { LlmServicePort, PricingLocation } from '@/domain/ports/LlmServicePort';
import { Persona } from '@/domain/entities/Persona';

describe('ParsePricingPageUseCase', () => {
  let useCase: ParsePricingPageUseCase;
  let mockBrowserService: Mocked<BrowserServicePort>;
  let mockLlmService: Mocked<LlmServicePort>;

  const mockPersona: Persona = {
    id: '1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Software Engineer',
    educationLevel: 'Bachelors',
    interests: ['Coding'],
    goals: ['Build great apps'],
    personalityTraits: ['Analytical'],
    conscientiousness: 80,
    neuroticism: 20,
    openness: 90,
    extraversion: 50,
    agreeableness: 60,
    cognitiveReflex: 100,
    technicalFluency: 90,
    economicSensitivity: 50,
    designStyle: 'Minimalist',
    livingEnvironment: 'Clean office'
  };

  beforeEach(() => {
    mockBrowserService = {
      navigateTo: vi.fn(),
      scrollDown: vi.fn(),
      scrollTo: vi.fn(),
      getElementLocation: vi.fn(),
      captureViewport: vi.fn(),
      captureFullPage: vi.fn(),
      getCleanedHtml: vi.fn(),
      close: vi.fn(),
      captureScreenshot: vi.fn(),
    } as any;

    mockLlmService = {
      isPricingVisibleInHtml: vi.fn(),
      summarizeHtml: vi.fn(),
      isPricingVisible: vi.fn(),
      analyzePricingPageStream: vi.fn(),
    } as any;

    useCase = new ParsePricingPageUseCase(mockBrowserService, mockLlmService);
  });

  it('should skip vision verification for high-confidence HTML targets', async () => {
    const url = 'https://example.com/pricing';
    const pricingLocation: PricingLocation = {
      found: true,
      selector: '#pricing-table',
      reasoning: 'Found pricing table ID'
    };

    mockBrowserService.getCleanedHtml.mockResolvedValue('<html><body><div id="pricing-table">...</div></body></html>');
    mockLlmService.isPricingVisibleInHtml.mockResolvedValue(pricingLocation);
    mockBrowserService.getElementLocation.mockResolvedValue(500);
    mockBrowserService.captureViewport.mockResolvedValue('base64-viewport');
    mockLlmService.summarizeHtml.mockResolvedValue('summarized-html');

    // Mocking analyzePricingPageStream to return a mock result
    mockLlmService.analyzePricingPageStream.mockResolvedValue({
      partialObjectStream: (async function* () {
        yield { thoughts: 'Analysis thoughts' };
      })(),
      object: Promise.resolve({
        gutReaction: 'Positive',
        thoughts: 'Good pricing',
        scores: {
          clarity: 5, clarityReason: "Test reason.",
          valuePerception: 5, valuePerceptionReason: "Test reason.",
          trust: 5, trustReason: "Test reason.",
          explorationIntent: 5, explorationIntentReason: "Test reason.",
          analysisIntent: 5, analysisIntentReason: "Test reason.",
          buyIntent: 5, buyIntentReason: "Test reason.",
        },
        risks: []
      })
    });

    const results = await useCase.execute(url, [mockPersona]);

    expect(mockLlmService.isPricingVisibleInHtml).toHaveBeenCalled();
    expect(mockBrowserService.getElementLocation).toHaveBeenCalledWith('#pricing-table', undefined);

    // Should NOT call isPricingVisible (vision scout) because of high confidence
    expect(mockLlmService.isPricingVisible).not.toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].gutReaction).toBe('Positive');
  });

  it('should use vision verification for low-confidence HTML targets', async () => {
    const url = 'https://example.com/pricing';
    const pricingLocation: PricingLocation = {
      found: true,
      selector: '.some-div',
      reasoning: 'Maybe pricing'
    };

    mockBrowserService.getCleanedHtml.mockResolvedValue('<html><body><div class="some-div">...</div></body></html>');
    mockLlmService.isPricingVisibleInHtml.mockResolvedValue(pricingLocation);
    mockBrowserService.getElementLocation.mockResolvedValue(500);
    mockBrowserService.captureViewport.mockResolvedValue('base64-viewport');
    mockLlmService.summarizeHtml.mockResolvedValue('summarized-html');
    mockLlmService.isPricingVisible.mockResolvedValue(true);

    mockLlmService.analyzePricingPageStream.mockResolvedValue({
      partialObjectStream: (async function* () {
        yield { thoughts: 'Analysis thoughts' };
      })(),
      object: Promise.resolve({
        gutReaction: 'Positive',
        thoughts: 'Good pricing',
        scores: {
          clarity: 5, clarityReason: "Test reason.",
          valuePerception: 5, valuePerceptionReason: "Test reason.",
          trust: 5, trustReason: "Test reason.",
          explorationIntent: 5, explorationIntentReason: "Test reason.",
          analysisIntent: 5, analysisIntentReason: "Test reason.",
          buyIntent: 5, buyIntentReason: "Test reason.",
        },
        risks: []
      })
    });

    await useCase.execute(url, [mockPersona]);

    expect(mockLlmService.isPricingVisibleInHtml).toHaveBeenCalled();
    // Should call isPricingVisible (vision scout) because of low confidence (generic class)
    expect(mockLlmService.isPricingVisible).toHaveBeenCalledWith('base64-viewport');
  });

  it('should parallelize HTML scouting and summarization', async () => {
    const url = 'https://example.com/pricing';

    let scoutingStarted = false;
    let summarizationStarted = false;

    mockLlmService.isPricingVisibleInHtml.mockImplementation(async () => {
      scoutingStarted = true;
      await new Promise(r => setTimeout(r, 50));
      return { found: false, reasoning: 'Not found' };
    });

    mockLlmService.summarizeHtml.mockImplementation(async () => {
      summarizationStarted = true;
      await new Promise(r => setTimeout(r, 50));
      return 'summary';
    });

    mockBrowserService.getCleanedHtml.mockResolvedValue('<html>...</html>');
    mockBrowserService.captureViewport.mockResolvedValue('shot');
    mockLlmService.isPricingVisible.mockResolvedValue(true);

    mockLlmService.analyzePricingPageStream.mockResolvedValue({
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.resolve({ scores: {} })
    });

    const start = Date.now();
    await useCase.execute(url, [mockPersona]);
    const elapsed = Date.now() - start;

    expect(scoutingStarted).toBe(true);
    expect(summarizationStarted).toBe(true);
    // With 50ms delays in each mock, true parallelism should complete closer to 50ms than 100ms.
    expect(elapsed).toBeLessThan(80);
  });

  it('should pass custom tokenLimit to LLM service', async () => {
    const url = 'https://example.com/pricing';
    const customLimit = 500;

    mockBrowserService.getCleanedHtml.mockResolvedValue('<html>...</html>');
    mockLlmService.isPricingVisibleInHtml.mockResolvedValue({ found: false, reasoning: 'Not found' });
    mockBrowserService.captureViewport.mockResolvedValue('shot');
    mockLlmService.summarizeHtml.mockResolvedValue('summary');

    mockLlmService.analyzePricingPageStream.mockResolvedValue({
      partialObjectStream: (async function* () { yield {}; })(),
      object: Promise.resolve({ scores: {} })
    });

    await useCase.execute(url, [mockPersona], undefined, undefined, { tokenLimit: customLimit });

    expect(mockLlmService.analyzePricingPageStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'summary',
      expect.objectContaining({ tokenLimit: customLimit })
    );
  });
});
