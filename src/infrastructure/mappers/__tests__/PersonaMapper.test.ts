import { describe, it, expect } from 'vitest'
import { dbToPersona, personaToDb } from '../PersonaMapper'
import type { Persona } from '@/domain/entities/Persona'

const persona: Persona = {
  id: '1',
  name: 'Test Persona',
  age: 30,
  occupation: 'Software Engineer',
  educationLevel: 'Bachelors',
  interests: ['coding'],
  goals: ['learning'],
  conscientiousness: 62,
  neuroticism: 38,
  openness: 71,
  extraversion: 45,
  agreeableness: 58,
  values: ['Efficiency'],
  fears: ['Wasted effort'],
  communicationStyle: 'Direct',
  decisionStyle: 'Data-driven',
  pricingSensitivity: 70,
  typicalBudget: '$50/mo',
  domainExpertise: ['developer tooling'],
  backstory: 'A test backstory',
}

describe('PersonaMapper', () => {
  it('supplies defaults for a row written before the psychographic fields existed', () => {
    const entity = dbToPersona({ id: 'legacy', name: 'Legacy', backstory: 'b' })

    expect(entity).toMatchObject({
      id: 'legacy',
      name: 'Legacy',
      conscientiousness: 50,
      neuroticism: 50,
      openness: 50,
      extraversion: 50,
      agreeableness: 50,
      pricingSensitivity: 50,
      typicalBudget: '',
      communicationStyle: '',
      decisionStyle: '',
      interests: [],
      goals: [],
      values: [],
      fears: [],
      domainExpertise: [],
    })
  })

  it('round-trips every persisted field', () => {
    const row = personaToDb(persona)

    expect(dbToPersona(row)).toEqual(row)
  })
})
