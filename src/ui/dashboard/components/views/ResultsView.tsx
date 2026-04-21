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
    <div className="flex flex-col gap-10 w-full animate-fade-in">

      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between border-b border-[rgba(26,26,27,0.1)] pb-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>What we heard</h2>
          <p className="text-muted-foreground text-sm">
            Observations and reactions from your audience.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[rgba(26,26,27,0.15)] bg-transparent px-6 text-sm font-medium text-foreground transition-all hover:bg-secondary/40 focus-visible:outline-none"
        >
          New Observation
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {analyses.map(analysis => {
          const index = analyses.indexOf(analysis);
          const persona = personas[index];

          if (!persona) return null;

          return (
            <MinimalCard key={analysis.id} className="p-8">
              <div className="flex flex-col md:flex-row gap-8">

                <div className="flex flex-col gap-6 w-full md:w-1/3 border-b md:border-b-0 md:border-r border-[rgba(26,26,27,0.1)] pb-8 md:pb-0 md:pr-8">
                  <div className="flex items-center gap-4">
                    <PersonaAvatar name={persona.name} size="lg" />
                    <div>
                      <h3 className="font-semibold text-lg" style={{ fontFamily: 'var(--font-fraunces)' }}>{persona.name}</h3>
                      <p className="text-sm text-muted-foreground">{persona.occupation}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-2">
                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Their scores</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <ScoreMetric label="Clarity" value={analysis.scores.clarity} />
                      <ScoreMetric label="Value" value={analysis.scores.valuePerception} />
                      <ScoreMetric label="Trust" value={analysis.scores.trust} />
                      <ScoreMetric label="Buy Intent" value={analysis.scores.likelihoodToBuy} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPersonaId(persona.id)}
                    className="mt-auto w-full inline-flex h-12 items-center justify-center rounded-xl bg-secondary/50 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none"
                  >
                    Talk to {persona.name.split(' ')[0]}
                  </button>
                </div>

                <div className="flex flex-col gap-8 w-full md:w-2/3">

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">First impression</h4>
                      <div
                        className={`w-2 h-2 rounded-full ${getSentimentVariant(analysis.scores.likelihoodToBuy)}`}
                        title="Tone Sentiment"
                      />
                    </div>
                    <div className={`p-4 rounded-xl border text-foreground/90 font-medium italic shadow-inner ${getSentimentBoxVariant(analysis.scores.likelihoodToBuy)}`}>
                      &quot;{analysis.gutReaction}&quot;
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">In their words</h4>
                    <div className="text-sm text-foreground/80 leading-relaxed space-y-4 whitespace-pre-wrap">
                      {analysis.thoughts}
                    </div>
                  </div>

                  {analysis.risks && analysis.risks.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h4 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">What gave them pause</h4>
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

                  <div className="mt-4 pt-6 border-t border-[rgba(26,26,27,0.08)] flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="bg-ink/5 text-foreground border border-ink/10 text-[10px] md:text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-2 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-kynd-pulse shrink-0" />
                      Observation
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

function ScoreMetric({ label, value }: { label: string, value: number }) {
  const getColorClass = (val: number) => {
    if (val >= 8) return "text-emerald-600"
    if (val >= 5) return "text-amber-600"
    return "text-destructive"
  }

  return (
    <div className="flex flex-col gap-1 bg-white/[0.02] backdrop-blur-md p-3 rounded-lg border border-[rgba(26,26,27,0.05)]">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={`text-xl font-bold font-variant-numeric tabular-nums ${getColorClass(value)}`}>{value}/10</span>
    </div>
  )
}

function getSentimentBoxVariant(score: number) {
  if (score >= 8) return "bg-emerald-500/5 border-emerald-500/10"
  if (score >= 5) return "bg-amber-500/5 border-amber-500/10"
  return "bg-red-500/5 border-red-500/10"
}

function getSentimentVariant(score: number) {
  if (score >= 8) return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
  if (score >= 5) return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
  return "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]"
}

function getAISuggestion(scores: { clarity: number, valuePerception: number, trust: number, likelihoodToBuy: number }) {
  const arr = [
    { key: "clarity", val: scores.clarity },
    { key: "valuePerception", val: scores.valuePerception },
    { key: "trust", val: scores.trust },
    { key: "likelihoodToBuy", val: scores.likelihoodToBuy }
  ].sort((a, b) => a.val - b.val);

  const lowest = arr[0].key;
  switch (lowest) {
    case "clarity": return "Consider making the tier differences more obvious."
    case "valuePerception": return "Try highlighting what is included—the outcomes, not just features."
    case "trust": return "Social proof and clear security practices could help here."
    case "likelihoodToBuy": return "A trial or guarantee might lower the barrier."
    default: return "Look at ways to make the path clearer."
  }
}