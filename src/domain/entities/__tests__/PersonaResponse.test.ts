import { describe, it, expect } from 'vitest'
import {
  PersonaResponseSchema,
  cleanLlmText,
  completedResponses,
  isCompletedResponse,
  responseCounts,
  type PersonaResponse,
} from '../PersonaResponse'

function response(overrides: Partial<PersonaResponse> = {}): PersonaResponse {
  return {
    id: 'resp-1',
    screenshotBase64: 'img',
    rawAnalysis: 'trace',
    overview: 'ok',
    customerJourney: [],
    researchQuestionAnswer: 'yes',
    majorFindings: [],
    pointsOfFriction: [],
    unansweredQuestions: [],
    ...overrides,
  }
}

describe('response outcome', () => {
  it('treats an absent outcome as completed, so persisted results stay readable', () => {
    expect(isCompletedResponse(response())).toBe(true)
    expect(isCompletedResponse(response({ outcome: 'completed' }))).toBe(true)
    expect(isCompletedResponse(response({ outcome: 'failed' }))).toBe(false)
  })

  it('counts completed, failed and attempted from the responses themselves', () => {
    const responses = [
      response({ id: 'a', outcome: 'completed' }),
      response({ id: 'b' }),
      response({ id: 'c', outcome: 'failed', failureMessage: 'nope' }),
    ]

    expect(completedResponses(responses).map((r) => r.id)).toEqual(['a', 'b'])
    expect(responseCounts(responses)).toEqual({ completed: 2, failed: 1, total: 3 })
    expect(responseCounts([])).toEqual({ completed: 0, failed: 0, total: 0 })
  })
})

describe('LLM text sanitising', () => {
  it('strips C0/C1 control characters, keeping tab, newline and carriage return', () => {
    expect(cleanLlmText('a\u0000b\u0007c\u001fd\u009fe')).toBe('abcde')
    expect(cleanLlmText('line\u0009one\nline\two\r')).toBe('line\u0009one\nline\two\r')
  })

  it('cleans every free-text field as the schema parses it', () => {
    const parsed = PersonaResponseSchema.parse({
      overview: 'Pricing\u0000 is clear',
      customerJourney: [
        {
          stage: 'interpretation',
          description: 'Saw\u0007 the hero',
          sentiment: 'neutral',
          outcome: 'stopped',
          transition: 'Stopped\u0000 here',
        },
      ],
      researchQuestionAnswer: 'Partly\u0000 yes',
      majorFindings: [
        { observation: 'Obs\u0000ervation', evidence: 'Evi\u0000dence', impact: 'Im\u0000pact' },
      ],
      pointsOfFriction: ['Friction\u0000 one'],
      unansweredQuestions: ['Question\u0001 one'],
    })

    expect(parsed.overview).toBe('Pricing is clear')
    expect(parsed.customerJourney[0].description).toBe('Saw the hero')
    expect(parsed.customerJourney[0].transition).toBe('Stopped here')
    expect(parsed.researchQuestionAnswer).toBe('Partly yes')
    expect(parsed.majorFindings[0]).toEqual({
      observation: 'Observation',
      evidence: 'Evidence',
      impact: 'Impact',
    })
    expect(parsed.pointsOfFriction).toEqual(['Friction one'])
    expect(parsed.unansweredQuestions).toEqual(['Question one'])
  })
})
