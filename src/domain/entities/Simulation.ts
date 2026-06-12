import { PricingAnalysis } from './PricingAnalysis'
import { PricingAnalysisProgressStep } from '@/application/usecases/ParsePricingPageUseCase'

export type SimulationStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

export interface Simulation {
  id: string
  name: string
  url: string
  status: SimulationStatus
  batchId?: string
  batchName?: string
  personaCount: number
  personaNames?: string[]
  createdAt: string
  completedAt?: string
  currentStep?: PricingAnalysisProgressStep
  completedAnalyses?: number
  totalAnalyses?: number
  analyses?: PricingAnalysis[]
  screenshot?: string
  streamingTexts?: Record<string, string>
  error?: string
}

export function generateSimulationName(url: string, batchName?: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    const siteName = hostname.replace(/^www\./, '').split('.')[0]
    return batchName
      ? `“${batchName}” on ${siteName}`
      : `Pricing Analysis — ${siteName}`
  } catch {
    return batchName
      ? `“${batchName}” — Pricing Analysis`
      : 'Pricing Analysis'
  }
}
