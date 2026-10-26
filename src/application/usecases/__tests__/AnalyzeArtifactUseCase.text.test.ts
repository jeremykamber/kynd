import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyzeArtifactUseCase } from '../AnalyzeArtifactUseCase'
import { ArtifactIntakeAdapter } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import type { LlmServicePort } from '@/domain/ports/LlmServicePort'
import type { Persona } from '@/domain/entities/Persona'
import type { ArtifactIntake } from '@/domain/entities/ArtifactIntake'

function makePersona(name: string): Persona {
  return {
    id: `p-${name}`,
    name,
    age: 30,
    occupation: 'designer',
    educationLevel: 'BA',
    interests: [],
    goals: ['evaluate tools'],
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
    values: [],
    fears: [],
    communicationStyle: 'direct',
    decisionStyle: 'gut-driven',
  }
}

function makeLlm(): LlmServicePort {
  return {
    generateSimulationTitle: vi.fn().mockResolvedValue('Is the brief concrete?'),
    generateVisceralMonologue: vi.fn().mockResolvedValue({ text: 'visceral reaction text' }),
    extractPersonaResponse: vi.fn().mockResolvedValue({
      overview: 'ok',
      customerJourney: [
        { stage: 'interpretation', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'understanding', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'belief', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'motivation', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
        { stage: 'action', description: 'd', sentiment: 'neutral', outcome: 'succeeded' },
      ],
      researchQuestionAnswer: 'answer',
      majorFindings: [],
      pointsOfFriction: [],
      unansweredQuestions: [],
    }),
  } as unknown as LlmServicePort
}

const textIntake: ArtifactIntake = {
  text: 'Feature brief: shared read-only analysis links for teammates.',
  label: 'shared-analyses-brief.docx',
}

function makeUseCase(llm: LlmServicePort, intake: ArtifactIntake) {
  return new AnalyzeArtifactUseCase(
    { intake: vi.fn().mockResolvedValue(intake) } as unknown as ArtifactIntakeAdapter,
    llm,
  )
}

describe('AnalyzeArtifactUseCase — text artifacts', () => {
  let llm: LlmServicePort

  beforeEach(() => {
    llm = makeLlm()
  })

  it('produces one response per persona, with no screenshot and no throw', async () => {
    const useCase = makeUseCase(llm, textIntake)
    const responses = await useCase.execute(
      { type: 'text', text: textIntake.text!, label: textIntake.label },
      [makePersona('Ada'), makePersona('Ben')],
      'Get sign-off from a teammate',
      'Does the brief explain the sharing model?',
    )

    expect(responses).toHaveLength(2)
    for (const response of responses) {
      expect(response.screenshotBase64).toBeUndefined()
      expect(response.overview).toBe('ok')
      expect(response.customerJourney).toHaveLength(5)
    }
  })

  it('tells both prompt stages it is reading a document, named by its label', async () => {
    const useCase = makeUseCase(llm, textIntake)
    await useCase.execute(
      { type: 'text', text: textIntake.text!, label: textIntake.label },
      [makePersona('Ada')],
      'goal',
      'rq',
    )

    expect(llm.generateVisceralMonologue).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada' }),
      textIntake,
      'rq',
      expect.objectContaining({ artifact: { kind: 'document', name: textIntake.label } }),
    )
    expect(llm.extractPersonaResponse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ada' }),
      'visceral reaction text',
      'rq',
      expect.objectContaining({ artifact: { kind: 'document', name: textIntake.label } }),
    )
  })

  it('gives the title the document text and label, and still streams the title', async () => {
    const useCase = makeUseCase(llm, textIntake)
    const titles: string[] = []
    await useCase.execute(
      { type: 'text', text: textIntake.text!, label: textIntake.label },
      [makePersona('Ada')],
      'goal',
      'rq',
      (progress) => {
        if (progress.title) titles.push(progress.title)
      },
    )

    expect(llm.generateSimulationTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactText: textIntake.text,
        artifactLabel: textIntake.label,
        screenshotBase64: undefined,
      }),
      expect.anything(),
    )
    await vi.waitFor(() => expect(titles).toContain('Is the brief concrete?'))
  })

  it('keeps a text run working when title generation fails', async () => {
    vi.mocked(llm.generateSimulationTitle).mockRejectedValue(new Error('title model down'))
    const useCase = makeUseCase(llm, textIntake)
    const responses = await useCase.execute(
      { type: 'text', text: textIntake.text!, label: textIntake.label },
      [makePersona('Ada')],
      'goal',
      'rq',
    )
    expect(responses).toHaveLength(1)
    expect(responses[0].overview).toBe('ok')
  })
})
