'use client'

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import type { AnalysisProgress } from '@/ui/hooks/useAnalysisFlow'
import type { PricingAnalysis } from '@/domain/entities/PricingAnalysis'
import type { Persona } from '@/domain/entities/Persona'

interface AnalysisContextValue {
  pricingUrl: string
  setPricingUrl: Dispatch<SetStateAction<string>>
  pricingImageBase64: string | null
  setPricingImageBase64: Dispatch<SetStateAction<string | null>>
  analyses: PricingAnalysis[] | null
  setAnalyses: Dispatch<SetStateAction<PricingAnalysis[] | null>>
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
  isPending: boolean
  analysisProgress: AnalysisProgress | null
  predictingGazeId: string | null
  handleAnalyzePricing: (personas: Persona[]) => void
  handlePredictGaze: (analysis: PricingAnalysis, persona: Persona) => void
  handleCancel: () => Promise<void>
  combinedAnalysisStream: string | undefined
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const analysisFlow = useAnalysisFlow()

  return (
    <AnalysisContext.Provider value={analysisFlow}>
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within an AnalysisProvider')
  return ctx
}
