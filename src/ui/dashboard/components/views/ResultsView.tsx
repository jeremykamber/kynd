"use client"

import { useState } from "react"
import { Persona } from "@/domain/entities/Persona"
import { PricingAnalysis } from "@/domain/entities/PricingAnalysis"
import { MinimalCard } from "@/components/custom/MinimalCard"
import { PersonaAvatar } from "@/components/custom/PersonaAvatar"
import { PersonaChat } from "../chat/PersonaChat"

interface ResultsViewProps {
  personas: Persona[]
  analyses: PricingAnalysis[]
  onReset: () => void
}

export function ResultsView({ personas, analyses, onReset }: ResultsViewProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)

  const getPersona = (id: string) => personas.find(p => p.id === id)
  const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

  return (
    <div className="flex flex-col gap-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between border-b border-border/40 pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Analysis Results</h2>
          <p className="text-muted-foreground text-sm">
            Insights and reactions from your synthesized audience.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-10 items-center justify-center rounded-full border border-border/60 bg-transparent px-6 text-sm font-medium text-foreground transition-all hover:bg-secondary/40 focus-visible:outline-none"
        >
          Start New Analysis
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {analyses.map(analysis => {
          // Find the persona for this analysis
          // Note: In MVP, analysis doesn't explicitly map to persona ID well in the array without passing it, 
          // but assuming they line up by index or we find it by matching. 
          // For now, let's just pair them up by index since they are processed in order.
          const index = analyses.indexOf(analysis);
          const persona = personas[index];

          if (!persona) return null;

          return (
            <MinimalCard key={analysis.id} className="p-8">
              <div className="flex flex-col md:flex-row gap-8">

                {/* Left Col: Persona Info & Scores */}
                <div className="flex flex-col gap-6 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-border/40 pb-8 md:pb-0 md:pr-8">
                  <div className="flex items-center gap-4">
                    <PersonaAvatar name={persona.name} size="lg" />
                    <div>
                      <h3 className="font-semibold text-lg">{persona.name}</h3>
                      <p className="text-sm text-muted-foreground">{persona.occupation}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-2">
                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Scoring</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <ScoreMetric label="Clarity" value={analysis.scores.clarity} reason={analysis.scores.clarityReason} />
                      <ScoreMetric label="Value" value={analysis.scores.valuePerception} reason={analysis.scores.valuePerceptionReason} />
                      <ScoreMetric label="Trust" value={analysis.scores.trust} reason={analysis.scores.trustReason} />
                    </div>

                    <div className="h-px bg-border/20 my-2" />

                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Intent Funnel</h4>
                    <div className="flex flex-col gap-3">
                      <FunnelStage label="Exploration" value={analysis.scores.explorationIntent} reason={analysis.scores.explorationIntentReason} color="bg-blue-500" />
                      <FunnelStage label="Analysis" value={analysis.scores.analysisIntent} reason={analysis.scores.analysisIntentReason} color="bg-indigo-500" />
                      <FunnelStage label="Buy Intent" value={analysis.scores.buyIntent} reason={analysis.scores.buyIntentReason} color="bg-emerald-500" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPersonaId(persona.id)}
                    className="mt-auto w-full inline-flex h-12 items-center justify-center rounded-xl bg-secondary/50 px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none"
                  >
                    Chat with {persona.name.split(' ')[0]}
                  </button>
                </div>

                {/* Right Col: Qualitative Feedback */}
                <div className="flex flex-col gap-8 w-full md:w-2/3">

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Gut Reaction</h4>
                      <div
                        className={`w-2 h-2 rounded-full ${getSentimentVariant(analysis.scores.buyIntent)}`}
                        title="Tone Sentiment"
                      />
                    </div>
                    <div className={`p-4 rounded-xl border text-foreground/90 font-medium italic shadow-inner ${getSentimentBoxVariant(analysis.scores.buyIntent)}`}>
                      &quot;{analysis.gutReaction}&quot;
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Detailed Thoughts</h4>
                    <div className="text-sm text-foreground/80 leading-relaxed space-y-4 whitespace-pre-wrap">
                      {analysis.thoughts}
                    </div>
                  </div>

                  {analysis.risks && analysis.risks.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Perceived Risks</h4>
                      <ul className="flex flex-col gap-2">
                        {analysis.risks.map((risk, i) => (
                          <li key={`risk-${analysis.id}-${i}`} className="flex items-start gap-2 text-sm text-foreground/80 leading-[1.6]">
                            <span className="text-destructive mt-0.5">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actionable Badge */}
                  <div className="mt-4 pt-6 border-t border-border/20 flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="bg-indigo-500/10 text-primary border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-2 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                      AI Suggestion
                    </span>
                    <span className="text-sm text-foreground/80 font-medium">
                      {getAISuggestion(analysis.scores)}
                    </span>
                  </div>
                </div>
              </div>
            </MinimalCard>
          )
        })}
      </div>

      {selectedPersona && (
        <PersonaChat
          persona={selectedPersona}
          isOpen={!!selectedPersona}
          onClose={() => setSelectedPersonaId(null)}
        />
      )}
    </div>
  )
}

function ScoreMetric({ label, value, reason }: { label: string, value: number, reason?: string }) {
  const getColorClass = (val: number) => {
    if (val >= 8) return "text-emerald-500"
    if (val >= 5) return "text-amber-500"
    return "text-destructive"
  }

  return (
    <div className="flex flex-col gap-1 bg-white/[0.02] backdrop-blur-md p-3 rounded-lg">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={`text-xl font-bold font-variant-numeric tabular-nums ${getColorClass(value)}`}>{value}/10</span>
      {reason && (
        <span className="text-[10px] text-muted-foreground/70 leading-tight mt-1">{reason}</span>
      )}
    </div>
  )
}

function FunnelStage({ label, value, reason, color }: { label: string, value: number, reason?: string, color: string }) {
  const getWidthPercent = (val: number) => Math.max(val * 10, 5)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground/80">{label}</span>
        <span className={`font-bold ${value >= 6 ? 'text-emerald-500' : value >= 4 ? 'text-amber-500' : 'text-destructive'}`}>{value}/10</span>
      </div>
      <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden relative">
        <div
          className={`h-full ${value >= 6 ? color : value >= 4 ? 'bg-amber-500' : 'bg-destructive'} rounded-full transition-all duration-500`}
          style={{ width: `${getWidthPercent(value)}%` }}
        />
      </div>
      {reason && (
        <span className="text-[10px] text-muted-foreground/70 leading-tight">{reason}</span>
      )}
    </div>
  )
}

function getSentimentBoxVariant(score: number) {
  if (score >= 8) return "bg-green-500/5 border-green-500/10"
  if (score >= 5) return "bg-amber-500/5 border-amber-500/10"
  return "bg-red-500/5 border-red-500/10"
}

function getSentimentVariant(score: number) {
  if (score >= 8) return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
  if (score >= 5) return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
  return "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]"
}

function getAISuggestion(scores: { clarity: number, valuePerception: number, trust: number, explorationIntent: number, analysisIntent: number, buyIntent: number }) {
  const funnel = [
    { key: "Exploration", val: scores.explorationIntent },
    { key: "Analysis", val: scores.analysisIntent },
    { key: "Buy Intent", val: scores.buyIntent },
  ].sort((a, b) => a.val - b.val);

  const biggestDrop = funnel[0];
  switch (biggestDrop.key) {
    case "Exploration": return "Users aren't interested enough to explore further. Improve initial value proposition and visual hierarchy.";
    case "Analysis": return "Users explore but don't dig deeper. Add comparison tools, feature highlights, or a free trial CTA.";
    case "Buy Intent": return "Users evaluate but don't convert. Add social proof, testimonials, or a risk-free guarantee.";
    default: return "Optimize the conversion funnel for better engagement.";
  }
}
