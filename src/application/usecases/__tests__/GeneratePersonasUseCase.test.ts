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

  beforeEach(() => {
    mockLlmService = {
      generateInitialPersonasStream: vi.fn(),
      generateInitialPersonas: vi.fn(),
      generateAbbreviatedBackstory: vi.fn(),
      generatePersonaBackstory: vi.fn(),
      generatePersonaInsight: vi.fn(),
    } as any;

    useCase = new GeneratePersonasUseCase(mockLlmService);
  });

  it('should generate personas and then backstories/insights in parallel', async () => {
    const description = 'Busy founders';

    mockLlmService.generateInitialPersonasStream.mockImplementation(async function* () {
      yield [mockPersona];
    });

    mockLlmService.generateAbbreviatedBackstory.mockResolvedValue('backstory content');
    mockLlmService.generatePersonaInsight.mockResolvedValue('insight content');

    const results = await useCase.execute(description);

    expect(mockLlmService.generateInitialPersonasStream).toHaveBeenCalledWith(description);
    expect(mockLlmService.generateAbbreviatedBackstory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Persona' }));
    expect(mockLlmService.generatePersonaInsight).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Persona' }));
    expect(results.length).toBe(1);
    expect(results[0].backstory).toBe('backstory content');
    expect(results[0].aiInsight).toBe('insight content');
  });

  it('should use parallel execution for multiple personas', async () => {
    const personas = [
      { id: '1', name: 'Persona 1' },
      { id: '2', name: 'Persona 2' },
      { id: '3', name: 'Persona 3' }
    ];

    mockLlmService.generateInitialPersonasStream.mockImplementation(async function* () {
      yield personas;
    });

    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const slowMock = async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise(r => setTimeout(r, 50));
      concurrentCalls--;
      return 'done';
    };

    mockLlmService.generateAbbreviatedBackstory.mockImplementation(slowMock);
    mockLlmService.generatePersonaInsight.mockImplementation(slowMock);

    await useCase.execute('description');

    // Since we have 3 personas and p-limit(5), they should all run in parallel
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
