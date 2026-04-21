"use client"

import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { MOCK_PERSONAS } from '@/domain/entities/MockPersonas'
import { MOCK_ANALYSES } from '@/domain/entities/MockAnalyses'

interface SetupViewProps {
  personaFlow: ReturnType<typeof usePersonaFlow>
  analysisFlow: ReturnType<typeof useAnalysisFlow>
  hasPersonas: boolean
}

export function SetupView({ personaFlow, analysisFlow, hasPersonas }: SetupViewProps) {
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
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Define your target market
        </h1>
        <p className="text-lg text-muted-foreground text-balance max-w-2xl">
          Describe who you are trying to reach. Kynd will craft personas that feel like real people—with their own perspectives, concerns, and ways of seeing the world.
        </p>
      </div>

      <div className="grid gap-12">
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground text-foreground font-bold hidden md:flex">
            1
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>Your audience</h2>
                <p className="text-sm text-muted-foreground">Paint a picture of who you are trying to reach—their situation, their challenges, who they are.</p>
              </div>
              <textarea 
                className="w-full min-h-[160px] resize-y rounded-xl border-0 border-b-2 border-foreground/20 bg-transparent px-4 py-3 text-base shadow-none placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-0 transition-colors duration-400"
                placeholder="e.g. B2B SaaS founders dealing with churn, usually thoughtful people who care about making the right decisions for their teams..."
                value={personaFlow.customerProfile}
                onChange={(e) => personaFlow.setCustomerProfile(e.target.value)}
                disabled={personaFlow.isPending || hasPersonas}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!personaFlow.customerProfile.trim() || personaFlow.isPending || hasPersonas}
                  onClick={personaFlow.handleGeneratePersonas}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-foreground px-8 text-sm font-semibold text-background shadow transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {personaFlow.isPending ? "Shaping personas..." : hasPersonas ? "Personas ready" : "Shape Personas"}
                </button>
              </div>
              {personaFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-xl">{personaFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>

        <section className={`flex flex-col gap-6 relative transition-opacity duration-500 ${!hasPersonas ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-foreground text-foreground font-bold hidden md:flex">
            2
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>What to explore</h2>
                <p className="text-sm text-muted-foreground">Share the URL of the page you would like your personas to experience.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  type="url"
                  className="flex h-12 w-full rounded-xl border-0 border-b-2 border-foreground/20 bg-transparent px-4 py-2 text-base shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:ring-0"
                  placeholder="https://your-startup.com/pricing"
                  value={analysisFlow.pricingUrl}
                  onChange={(e) => analysisFlow.setPricingUrl(e.target.value)}
                  disabled={analysisFlow.isPending || !hasPersonas}
                />
                <button
                  type="button"
                  disabled={(!analysisFlow.pricingUrl.trim() && !analysisFlow.pricingImageBase64) || analysisFlow.isPending || !hasPersonas}
                  onClick={() => analysisFlow.handleAnalyzePricing(personaFlow.personas!)}
                  className="inline-flex h-12 whitespace-nowrap items-center justify-center rounded-xl bg-foreground px-8 text-sm font-semibold text-background shadow transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {analysisFlow.isPending ? "Observing..." : "Begin Observation"}
                </button>
              </div>
              {analysisFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-xl">{analysisFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>
      </div>
    </div>
  )
}