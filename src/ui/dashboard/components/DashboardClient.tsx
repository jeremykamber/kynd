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

  const hasPersonas = personaFlow.personas && personaFlow.personas.length > 0
  const hasAnalyses = analysisFlow.analyses && analysisFlow.analyses.length > 0

  return (
    <div className="flex flex-col gap-12 w-full animate-fade-in">
      
      {(!hasPersonas || !hasAnalyses) && (
        <SetupView 
          personaFlow={personaFlow} 
          analysisFlow={analysisFlow} 
          hasPersonas={!!hasPersonas} 
        />
      )}

      {hasPersonas && !hasAnalyses && (
        <AudienceView 
          personas={personaFlow.personas!} 
          analysisFlow={analysisFlow}
        />
      )}

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

      <FlowDialog
        open={!!personaFlow.personaProgress}
        onOpenChange={(open) => {
          if (!open && personaFlow.personaProgress) {
            personaFlow.handleCancel()
          }
        }}
        title="Preparing your audience"
        description="Kynd is shaping personas from your description."
        currentStep={
          personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS' ? 0 :
          personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES' ? 1 : 0
        }
        steps={[
          { title: "Understanding your market", description: "Mapping demographics and psychographics" },
          { title: "Crafting personas", description: "Creating backstories and perspectives" },
          { title: "Final touches", description: "Preparing profiles for observation" }
        ]}
      >
        {personaFlow.personaProgress && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <p className="text-sm font-medium text-muted-foreground animate-kynd-pulse">
              {personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS' && "Mapping the landscape..."}
              {personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES' && (
                `Giving shape to thoughts (${personaFlow.personaProgress.completedCount || 0}/${personaFlow.personaProgress.totalCount || 3})`
              )}
            </p>
            {personaFlow.personaProgress.personaName && (
              <p className="text-sm text-foreground/80">Working on: <span className="font-semibold">{personaFlow.personaProgress.personaName}</span></p>
            )}
          </div>
        )}
      </FlowDialog>

      <FlowDialog
        open={!!analysisFlow.analysisProgress}
        onOpenChange={(open) => {
          if (!open && analysisFlow.analysisProgress) {
            analysisFlow.handleCancel()
          }
        }}
        title="Observing reactions"
        description="Your audience is sharing their thoughts."
        currentStep={
          analysisFlow.analysisProgress?.step === 'STARTING' || analysisFlow.analysisProgress?.step === 'OPENING_PAGE' ? 0 :
          analysisFlow.analysisProgress?.step === 'FINDING_PRICING' ? 1 : 
          analysisFlow.analysisProgress?.step === 'THINKING' ? 2 : 0
        }
        steps={[
          { title: "Setting the scene", description: "Preparing the experience" },
          { title: "Watching closely", description: "Noting first impressions" },
          { title: "Gathering insights", description: "Collecting reactions and thoughts" }
        ]}
      >
        {analysisFlow.analysisProgress && (
          <div className="flex flex-col items-center justify-center space-y-4 w-full">
            <p className="text-sm font-medium text-muted-foreground animate-kynd-pulse">
              {analysisFlow.analysisProgress.step === 'OPENING_PAGE' && "Loading the page..."}
              {analysisFlow.analysisProgress.step === 'FINDING_PRICING' && "Watching their eyes move..."}
              {analysisFlow.analysisProgress.step === 'THINKING' && (
                `Listening (${analysisFlow.analysisProgress.completedCount || 0}/${analysisFlow.analysisProgress.totalCount || 3})`
              )}
            </p>

            {analysisFlow.analysisProgress.screenshot && (
              <div className="relative w-full max-w-lg aspect-video rounded-xl overflow-hidden border border-[rgba(26,26,27,0.1)] shadow-sm bg-secondary/30">
                <img 
                  src={`data:image/jpeg;base64,${analysisFlow.analysisProgress.screenshot}`} 
                  alt="AI Agent View" 
                  className="w-full h-full object-cover object-top opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent flex items-end justify-center pb-2 pointer-events-none">
                   <span className="text-[10px] font-mono text-muted-foreground px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-[rgba(26,26,27,0.1)]">
                     LIVE OBSERVATION
                   </span>
                </div>
              </div>
            )}
            
            {analysisFlow.analysisProgress.streamingTexts && Object.keys(analysisFlow.analysisProgress.streamingTexts).length > 0 && (
              <div className="w-full max-w-lg bg-secondary/30 rounded-xl p-4 max-h-[200px] overflow-y-auto custom-scrollbar border border-[rgba(26,26,27,0.08)] text-left">
                 {Object.entries(analysisFlow.analysisProgress.streamingTexts).map(([name, text]) => (
                    <div key={name} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold text-foreground mb-1">{name} is thinking:</p>
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