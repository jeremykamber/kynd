"use client"

import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { MOCK_PERSONAS } from '@/domain/entities/MockPersonas'
import { MOCK_ANALYSES } from '@/domain/entities/MockAnalyses'
import { Persona } from '@/domain/entities/Persona'
import Link from 'next/link'
import { ExternalLinkIcon } from 'lucide-react'

interface SetupViewProps {
  personaFlow: ReturnType<typeof usePersonaFlow>
  analysisFlow: ReturnType<typeof useAnalysisFlow>
  hasPersonas: boolean
  currentSimulationId?: string | null
  onStartSimulation?: (personas: Persona[]) => void
}

export function SetupView({ personaFlow, analysisFlow, hasPersonas, currentSimulationId, onStartSimulation }: SetupViewProps) {
  const loadMockPersonas = () => {
    personaFlow.setPersonas(MOCK_PERSONAS)
  }

  const loadMockAnalysis = () => {
    personaFlow.setPersonas(MOCK_PERSONAS)
    const mockAnalysesList = Object.values(MOCK_ANALYSES)
    analysisFlow.setAnalyses(mockAnalysesList)
  }

  return (
    <div className="flex flex-col gap-16 max-w-4xl mx-auto w-full">
      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={loadMockPersonas}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Load Demo Personas
        </button>
        <button
          type="button"
          onClick={loadMockAnalysis}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Load Demo Analysis
        </button>
      </div>
      <div className="flex flex-col gap-4 text-center items-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
          Define your target market
        </h1>
        <p className="text-lg text-muted-foreground text-balance max-w-2xl">
          Provide a brief description of who you are trying to reach. Kynd will synthesize a set of detailed personas that represent your audience.
        </p>
      </div>

      <div className="grid gap-12">
        {/* Step 1: Customer Profile */}
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            1
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Audience Description</h2>
                <p className="text-sm text-muted-foreground">Describe your ideal customer, their pain points, and demographics.</p>
              </div>
              <textarea 
                className="w-full min-h-[160px] resize-y rounded-md border border-input bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                placeholder="e.g. B2B SaaS Founders dealing with high churn rates, usually aged 30-45..."
                value={personaFlow.customerProfile}
                onChange={(e) => personaFlow.setCustomerProfile(e.target.value)}
                disabled={personaFlow.isPending || hasPersonas}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!personaFlow.customerProfile.trim() || personaFlow.isPending || hasPersonas}
                  onClick={personaFlow.handleGeneratePersonas}
                  className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {personaFlow.isPending ? "Generating..." : hasPersonas ? "Personas Generated" : "Generate Personas"}
                </button>
              </div>
              {personaFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{personaFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>

        {/* Step 2: URL / Image Upload */}
        <section className={`flex flex-col gap-6 relative transition-opacity duration-500 ${!hasPersonas ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            2
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Test Environment</h2>
                <p className="text-sm text-muted-foreground">Provide the URL of the pricing page or feature you want these personas to evaluate.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  type="url"
                  className="flex h-12 w-full rounded-md border border-input bg-transparent px-4 py-2 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="https://your-startup.com/pricing"
                  value={analysisFlow.pricingUrl}
                  onChange={(e) => analysisFlow.setPricingUrl(e.target.value)}
                  disabled={analysisFlow.isPending || !hasPersonas}
                />
                <button
                  type="button"
                  disabled={(!analysisFlow.pricingUrl.trim() && !analysisFlow.pricingImageBase64) || analysisFlow.isPending || !hasPersonas}
                  onClick={() => onStartSimulation?.(personaFlow.personas!)}
                  className="inline-flex h-12 whitespace-nowrap items-center justify-center rounded-md bg-foreground px-8 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {analysisFlow.isPending ? "Simulating..." : "Run Simulation"}
                </button>
              </div>
              {currentSimulationId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 border border-primary/10 rounded-md p-3">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span>Simulation started</span>
                  <Link
                    href={`/dashboard/simulations/${currentSimulationId}`}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View progress
                    <ExternalLinkIcon className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {analysisFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{analysisFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>
      </div>
    </div>
  )
}
