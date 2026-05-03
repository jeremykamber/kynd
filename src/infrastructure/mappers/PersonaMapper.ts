// Mapper for Persona
import { Persona } from '../../domain/entities/Persona'
// Uncomment if using DTO:
// import { PersonaDTO } from '../../domain/dtos/PersonaDTO'

// Example: DB record to entity
export function dbToPersona(db: any): Persona {
  return {
    id: db.id,
    name: db.name,
    age: db.age,
    occupation: db.occupation,
    educationLevel: db.educationLevel,
    interests: db.interests || [],
    goals: db.goals || [],
    personalityTraits: db.personalityTraits || [],
    backstory: db.backstory,
    // Psychometric and Aesthetic properties
    conscientiousness: db.conscientiousness ?? 50,
    neuroticism: db.neuroticism ?? 50,
    openness: db.openness ?? 50,
    extraversion: db.extraversion ?? 50,
    agreeableness: db.agreeableness ?? 50,
    cognitiveReflex: db.cognitiveReflex ?? 50,
    technicalFluency: db.technicalFluency ?? 50,
    economicSensitivity: db.economicSensitivity ?? 50,
    designStyle: db.designStyle ?? "Minimalist",
    livingEnvironment: db.livingEnvironment ?? "Organized habitat",
  }
}

// Example: entity to DB record
export function personaToDb(entity: Persona): any {
  return {
    id: entity.id,
    name: entity.name,
    age: entity.age,
    occupation: entity.occupation,
    educationLevel: entity.educationLevel,
    interests: entity.interests,
    goals: entity.goals,
    personalityTraits: entity.personalityTraits,
    backstory: entity.backstory,
    // Psychometric and Aesthetic properties
    conscientiousness: entity.conscientiousness,
    neuroticism: entity.neuroticism,
    openness: entity.openness,
    extraversion: entity.extraversion,
    agreeableness: entity.agreeableness,
    cognitiveReflex: entity.cognitiveReflex,
    technicalFluency: entity.technicalFluency,
    economicSensitivity: entity.economicSensitivity,
    designStyle: entity.designStyle,
    livingEnvironment: entity.livingEnvironment,
  }
}


