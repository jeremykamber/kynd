// Mapper for PricingAnalysis
import { PricingAnalysis } from '../../domain/entities/PricingAnalysis'
// Uncomment if using DTO:
// import { PricingAnalysisDTO } from '../../domain/dtos/PricingAnalysisDTO'

// Example: DB record to entity
export function dbToPricingAnalysis(db: any): PricingAnalysis {
  return {
    id: db.id,
    url: db.url,
    screenshotBase64: db.screenshotBase64,
    thoughts: db.thoughts,
    scores: {
      clarity: db.clarity,
      valuePerception: db.valuePerception,
      trust: db.trust,
      likelihoodToBuy: db.likelihoodToBuy,
    },
    risks: db.risks || [],
  }
}

// Example: entity to DB record
export function pricingAnalysisToDb(entity: PricingAnalysis): any {
  return {
    id: entity.id,
    url: entity.url,
    screenshotBase64: entity.screenshotBase64,
    thoughts: entity.thoughts,
    clarity: entity.scores.clarity,
    valuePerception: entity.scores.valuePerception,
    trust: entity.scores.trust,
    likelihoodToBuy: entity.scores.likelihoodToBuy,
    risks: entity.risks,
  }
}


