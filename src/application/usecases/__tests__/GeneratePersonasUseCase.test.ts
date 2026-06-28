import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { GeneratePersonasUseCase } from '../GeneratePersonasUseCase';
import { LlmServicePort } from '@/domain/ports/LlmServicePort';
import { Persona } from '@/domain/entities/Persona';

describe('GeneratePersonasUseCase', () => {
  let useCase: GeneratePersonasUseCase;
  let mockLlmService: Mocked<LlmServicePort>;

  const mockPersona: Partial<Persona> = {
    id: '1',
    name: 'Test Persona',
  };

  const fullPersona: Persona = {
    id: '1',
    name: 'Test Persona',
    age: 30,
    occupation: 'Tester',
    educationLevel: "Bachelor's",
    interests: ['Testing'],
    goals: ['Write good tests'],
    personalityTraits: ['Thorough'],
    conscientiousness: 80,
    neuroticism: 20,
    openness: 70,
    extraversion: 50,
    agreeableness: 60,
    cognitiveReflex: 100,
    technicalFluency: 80,
    economicSensitivity: 50,
    designStyle: 'Clean',
    livingEnvironment: 'Office',
  };

  beforeEach(() => {
    mockLlmService = {
      generateInitialPersonas: vi.fn(),
      generateAbbreviatedBackstoriesBatch: vi.fn(),
      rationalizePersonas: vi.fn(),
      generatePersonaInsightsBatch: vi.fn(),
    } as any;

    useCase = new GeneratePersonasUseCase(mockLlmService);
  });

  it('should generate personas and then backstories/insights in parallel', async () => {
    const description = 'Busy founders';

    mockLlmService.generateInitialPersonas.mockResolvedValue([{ ...fullPersona }]);
    mockLlmService.generateAbbreviatedBackstoriesBatch.mockResolvedValue(['backstory content']);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);
    mockLlmService.generatePersonaInsightsBatch.mockResolvedValue(['insight content']);

    const results = await useCase.execute(description);

    expect(mockLlmService.generateInitialPersonas).toHaveBeenCalledWith(description, undefined);
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).toHaveBeenCalled();
    expect(mockLlmService.rationalizePersonas).toHaveBeenCalled();
    expect(mockLlmService.generatePersonaInsightsBatch).toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].backstory).toBe('backstory content');
    expect(results[0].aiInsight).toBe('insight content');
  });

  it('should use parallel execution for multiple personas', async () => {
    const personas = [
      { ...fullPersona, id: '1', name: 'Persona 1' },
      { ...fullPersona, id: '2', name: 'Persona 2' },
      { ...fullPersona, id: '3', name: 'Persona 3' }
    ];

    mockLlmService.generateInitialPersonas.mockResolvedValue(personas);
    mockLlmService.generateAbbreviatedBackstoriesBatch.mockResolvedValue(['a', 'b', 'c']);
    mockLlmService.rationalizePersonas.mockImplementation(async (ps: Persona[]) => ps);
    mockLlmService.generatePersonaInsightsBatch.mockResolvedValue(['x', 'y', 'z']);

    await useCase.execute('description');

    expect(mockLlmService.generateInitialPersonas).toHaveBeenCalled();
    expect(mockLlmService.generateAbbreviatedBackstoriesBatch).toHaveBeenCalled();
    expect(mockLlmService.generatePersonaInsightsBatch).toHaveBeenCalled();
  });
});
