"use client"

import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { SetupView } from './views/SetupView'
import { AudienceView } from './views/AudienceView'
import { ResultsView } from './views/ResultsView'
import { FlowDialog } from '@/components/custom/FlowDialog'

export function DashboardClient() {
  const personaFlow = usePersonaFlow()
  const analysisFlow = useAnalysisFlow()

  // State mapping
  const hasPersonas = personaFlow.personas && personaFlow.personas.length > 0
  const hasAnalyses = analysisFlow.analyses && analysisFlow.analyses.length > 0

  return (
    <div className="flex flex-col gap-12 w-full animate-in fade-in duration-500">
      
      {/* 1. Setup View: Inputs for Customer Profile & Pricing URL */}
      {(!hasPersonas || !hasAnalyses) && (
        <SetupView 
          personaFlow={personaFlow} 
          analysisFlow={analysisFlow} 
          hasPersonas={!!hasPersonas} 
        />
      )}

      {/* 2. Audience View: Show generated Personas */}
      {hasPersonas && !hasAnalyses && (
        <AudienceView 
          personas={personaFlow.personas!} 
          analysisFlow={analysisFlow}
        />
      )}

      {/* 3. Results View: Show Pricing Analyses & Chat */}
      {hasPersonas && hasAnalyses && (
        <ResultsView 
          personas={personaFlow.personas!} 
          analyses={analysisFlow.analyses!}
          onReset={() => {
            personaFlow.setPersonas(null)
            analysisFlow.setAnalyses(null)
            personaFlow.setCustomerProfile('')
            analysisFlow.setPricingUrl('')
            analysisFlow.setPricingImageBase64(null)
          }}
        />
      )}

      {/* Persona Generation Streaming Dialog */}
      <FlowDialog
        open={!!personaFlow.personaProgress}
        onOpenChange={(open) => {
          if (!open && personaFlow.personaProgress) {
            personaFlow.handleCancel()
          }
        }}
        title="Synthesizing Audience"
        description="DeepBound is generating realistic personas based on your target profile."
        currentStep={
          personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS' ? 0 :
          personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES' ? 1 : 0
        }
        steps={[
          { title: "Analyzing Market", description: "Mapping demographics and psychographics" },
          { title: "Generating Personas", description: "Creating detailed backstories and traits" },
          { title: "Finalizing", description: "Preparing avatars and profiles" }
        ]}
      >
        {personaFlow.personaProgress && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              {personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS' && "Identifying key demographic segments..."}
              {personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES' && (
                `Fleshing out backstories (${personaFlow.personaProgress.completedCount || 0}/${personaFlow.personaProgress.totalCount || 3})`
              )}
            </p>
            {personaFlow.personaProgress.personaName && (
              <p className="text-sm text-foreground/80">Currently generating: <span className="font-semibold">{personaFlow.personaProgress.personaName}</span></p>
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
        title="Running Simulations"
        description="Personas are actively reviewing your product and pricing strategy."
        currentStep={
          analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
          analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
          analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 0
        }
        steps={[
          { title: "Initialization", description: "Loading target experience" },
          { title: "Visual Capture", description: "Scanning pricing structure" },
          { title: "Cognitive Analysis", description: "Simulating persona thoughts and reactions" }
        ]}
      >
        {analysisFlow.analysisProgress && (
          <div className="flex flex-col items-center justify-center space-y-4 w-full">
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              {analysisFlow.analysisProgress.step === 'OPENING_PAGE' && "Loading pricing page..."}
              {analysisFlow.analysisProgress.step === 'FINDING_PRICING' && "Capturing visual layout..."}
              {analysisFlow.analysisProgress.step === 'THINKING' && (
                `Gathering feedback (${analysisFlow.analysisProgress.completedCount || 0}/${analysisFlow.analysisProgress.totalCount || 3})`
              )}
            </p>

            {/* AI Vision Stream (Screenshot Preview) */}
            {analysisFlow.analysisProgress.screenshot && (
              <div className="relative w-full max-w-lg aspect-video rounded-xl overflow-hidden border border-border shadow-sm bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={`data:image/jpeg;base64,${analysisFlow.analysisProgress.screenshot}`} 
                  alt="AI Agent View" 
                  className="w-full h-full object-cover object-top opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end justify-center pb-2 pointer-events-none">
                   <span className="text-[10px] font-mono text-muted-foreground px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-border/50">
                     LIVE AGENT VISION
                   </span>
                </div>
              </div>
            )}
            
            {/* Show streaming thoughts if available */}
            {analysisFlow.analysisProgress.streamingTexts && Object.keys(analysisFlow.analysisProgress.streamingTexts).length > 0 && (
              <div className="w-full max-w-lg bg-secondary/30 rounded-lg p-4 max-h-[200px] overflow-y-auto custom-scrollbar border border-border/40 text-left">
                 {Object.entries(analysisFlow.analysisProgress.streamingTexts).map(([name, text]) => (
                    <div key={name} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold text-primary mb-1">{name} is thinking:</p>
                      <p className="text-xs text-foreground/80 font-mono whitespace-pre-wrap">{text.slice(-200)}...</p>
                    </div>
                 ))}
              </div>
            )}
          </div>
        )}
      </FlowDialog>
    </div>
  )
}
