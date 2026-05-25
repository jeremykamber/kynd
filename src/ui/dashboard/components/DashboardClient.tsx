'use client'

import { useState } from 'react'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { SetupView } from './views/SetupView'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaDetailSheet } from '@/components/custom/PersonaDetailSheet'
import { LayersIcon } from 'lucide-react'
import Link from 'next/link'
import { FlowDialog } from '@/components/custom/FlowDialog'
import { Persona } from '@/domain/entities/Persona'

export function DashboardClient() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
  const [sheetDefaultTab, setSheetDefaultTab] = useState<"profile" | "chat">("profile")
  const batches = usePersonaStore((s) => s.batches)
  const activeBatchId = usePersonaStore((s) => s.activeBatchId)
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
  const personaFlow = usePersonaFlow()
  const analysisFlow = useAnalysisFlow()

  const activeBatch = activeBatchId
    ? batches.find((b) => b.id === activeBatchId)
    : null

  const getPersona = (id: string) => activeBatch?.personas.find(p => p.id === id) ?? null
  const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

  const handleOpenDetail = (id: string) => {
    setSelectedPersonaId(id)
    setSheetDefaultTab("profile")
    setIsDetailSheetOpen(true)
  }

  const handleOpenChat = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    setSheetDefaultTab("chat")
    setIsDetailSheetOpen(true)
  }

  const handleCloseSheet = () => {
    setIsDetailSheetOpen(false)
    setSelectedPersonaId(null)
  }

  // No batches yet — show the setup flow with streaming dialogs
  if (batches.length === 0) {
    return (
      <>
        <div className="animate-in fade-in duration-500">
          <SetupView
            personaFlow={personaFlow}
            analysisFlow={analysisFlow}
            hasPersonas={false}
          />
        </div>

        {/* Persona Generation Streaming Dialog */}
        <FlowDialog
          open={!!personaFlow.personaProgress}
          onOpenChange={(open) => {
            if (!open && personaFlow.personaProgress) {
              personaFlow.handleCancel()
            }
          }}
          transparentOverlay
          title="Synthesizing Audience"
          description="Kynd is generating realistic personas based on your target profile."
          currentStep={
            personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS'
              ? 0
              : personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES'
                ? 1
                : personaFlow.personaProgress?.step === 'ENHANCING_WITH_PBJ'
                  ? 2
                  : 3
          }
          steps={[
            { title: 'Analyzing Market', description: 'Mapping demographics and psychographics' },
            { title: 'Generating Personas', description: 'Creating detailed backstories and traits' },
            { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality (PB&J)' },
            { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
          ]}
        >
          {personaFlow.personaProgress && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                {personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS' &&
                  'Identifying key demographic segments...'}
                {personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES' &&
                  `Fleshing out backstories (${personaFlow.personaProgress.completedCount || 0}/${personaFlow.personaProgress.totalCount || 3})`}
                {personaFlow.personaProgress.step === 'ENHANCING_WITH_PBJ' &&
                  'Building psychological rationales...'}
              </p>
              {personaFlow.personaProgress.personaName && (
                <p className="text-sm text-foreground/80">
                  Currently generating:{' '}
                  <span className="font-semibold">
                    {personaFlow.personaProgress.personaName}
                  </span>
                </p>
              )}
            </div>
          )}
        </FlowDialog>

        {/* Analysis Generation Streaming Dialog */}
        <FlowDialog
          open={!!analysisFlow.analysisProgress}
          onOpenChange={(open) => {
            if (!open && analysisFlow.analysisProgress) {
              analysisFlow.handleCancel()
            }
          }}
          transparentOverlay
          title="Running Simulations"
          description="Personas are actively reviewing your product and pricing strategy."
          currentStep={
            analysisFlow.analysisProgress?.step === 'STARTING' ||
            analysisFlow.analysisProgress?.step === 'OPENING_PAGE'
              ? 0
              : analysisFlow.analysisProgress?.step === 'FINDING_PRICING'
                ? 1
                : analysisFlow.analysisProgress?.step === 'THINKING'
                  ? 2
                  : 0
          }
          steps={[
            { title: 'Initialization', description: 'Loading target experience' },
            { title: 'Visual Capture', description: 'Scanning pricing structure' },
            { title: 'Cognitive Analysis', description: 'Simulating persona thoughts and reactions' },
          ]}
        >
          {analysisFlow.analysisProgress && (
            <div className="flex flex-col items-center justify-center space-y-4 w-full">
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                {analysisFlow.analysisProgress.step === 'OPENING_PAGE' &&
                  'Loading pricing page...'}
                {analysisFlow.analysisProgress.step === 'FINDING_PRICING' &&
                  'Capturing visual layout...'}
                {analysisFlow.analysisProgress.step === 'THINKING' &&
                  `Gathering feedback (${analysisFlow.analysisProgress.completedCount || 0}/${analysisFlow.analysisProgress.totalCount || 3})`}
              </p>

              {/* AI Vision Stream (Screenshot Preview) */}
              {analysisFlow.analysisProgress.screenshot && (
                <div className="relative w-full max-w-lg aspect-video rounded-lg overflow-hidden border border-border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/jpeg;base64,${analysisFlow.analysisProgress.screenshot}`}
                    alt="AI Agent View"
                    className="w-full h-full object-cover object-top opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end justify-center pb-2 pointer-events-none">
                    <span className="text-[10px] font-mono text-muted-foreground px-2 py-1 rounded-md bg-muted/80 border border-border">
                      LIVE AGENT VISION
                    </span>
                  </div>
                </div>
              )}

              {/* Show streaming thoughts if available */}
              {analysisFlow.analysisProgress.streamingTexts &&
                Object.keys(analysisFlow.analysisProgress.streamingTexts).length > 0 && (
                  <div className="w-full max-w-lg bg-secondary/30 rounded-lg p-4 max-h-[200px] overflow-y-auto custom-scrollbar border border-border/40 text-left">
                    {Object.entries(analysisFlow.analysisProgress.streamingTexts).map(
                      ([name, text]) => (
                        <div key={name} className="mb-4 last:mb-0">
                          <p className="text-xs font-semibold text-primary mb-1">
                            {name} is thinking:
                          </p>
                          <p className="text-xs text-foreground/80 font-mono whitespace-pre-wrap">
                            {text.slice(-200)}...
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                )}
            </div>
          )}
        </FlowDialog>
      </>
    )
  }

  // Batches exist — show batch list or active batch personas
  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Batch selector header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
        <Link
          href="/dashboard/interviews"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + New from Interviews
        </Link>
      </div>

      {!activeBatch ? (
        /* Batch list when none selected */
        <div className="flex flex-col gap-4">
          {batches.map((batch) => (
            <button
              key={batch.id}
              onClick={() => setActiveBatch(batch.id)}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <LayersIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="font-semibold truncate">{batch.label}</span>
                <span className="text-sm text-muted-foreground">
                  {batch.personas.length} personas ·{' '}
                  {batch.source === 'interviews'
                    ? `${batch.transcriptCount} transcripts`
                    : 'from description'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(batch.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* Active batch personas */
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold tracking-tight">
                {activeBatch.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeBatch.personas.length} personas ·{' '}
                {activeBatch.source === 'interviews'
                  ? `${activeBatch.transcriptCount} interview transcripts`
                  : 'Generated from description'}
                · {new Date(activeBatch.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setActiveBatch(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              All Batches
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatch.personas.map((persona) => (
              <PersonaProfilePanel
                key={persona.id}
                persona={persona}
                onClick={() => handleOpenDetail(persona.id)}
                onChatClick={() => handleOpenChat(persona)}
              />
            ))}
          </div>

          {activeBatch.source === 'interviews' && (
            <div className="border-t border-border/40 pt-8 mt-8">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">Run Report</h3>
                  <p className="text-sm text-muted-foreground">
                    Test how these interview-grounded personas react to your pricing page.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="url"
                    className="flex h-12 w-full rounded-md border border-input bg-transparent px-4 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="https://your-startup.com/pricing"
                    value={analysisFlow.pricingUrl}
                    onChange={(e) => analysisFlow.setPricingUrl(e.target.value)}
                    disabled={analysisFlow.isPending}
                  />
                  <button
                    type="button"
                    disabled={!analysisFlow.pricingUrl.trim() || analysisFlow.isPending}
                    onClick={() => analysisFlow.handleAnalyzePricing(activeBatch.personas)}
                    className="inline-flex h-12 whitespace-nowrap items-center justify-center rounded-md bg-foreground px-8 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                  >
                    {analysisFlow.isPending ? "Simulating..." : "Run Pricing Simulation"}
                  </button>
                </div>
                {analysisFlow.error && (
                  <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{analysisFlow.error}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <PersonaDetailSheet
        persona={selectedPersona}
        isOpen={isDetailSheetOpen}
        onClose={handleCloseSheet}
        defaultTab={sheetDefaultTab}
      />
    </div>
  )
}
