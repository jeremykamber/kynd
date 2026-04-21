"use client"

import { useState } from "react"
import { Persona } from '@/domain/entities/Persona'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaChat } from "../chat/PersonaChat"
import { PersonaDetailModal } from "@/components/custom/PersonaDetailModal"

interface AudienceViewProps {
  personas: Persona[]
  analysisFlow: ReturnType<typeof useAnalysisFlow>
}

export function AudienceView({ personas, analysisFlow }: AudienceViewProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  const getPersona = (id: string) => personas.find(p => p.id === id)
  const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

  const handleOpenDetail = (id: string) => {
    setSelectedPersonaId(id)
    setIsDetailModalOpen(true)
  }

  const handleOpenChat = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    setIsDetailModalOpen(false)
    setIsChatOpen(true)
  }

  return (
    <div className="flex flex-col gap-10 w-full animate-fade-in">
      <div className="flex flex-col gap-2 border-b border-[rgba(26,26,27,0.1)] pb-6">
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>Your audience</h2>
        <p className="text-muted-foreground text-sm">
          Meet the personas shaped from your description. Each has their own perspective—chat with them to understand their thinking.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {personas.map((persona) => (
          <PersonaProfilePanel
            key={persona.id}
            persona={persona}
            onClick={() => handleOpenDetail(persona.id)}
            onChatClick={() => handleOpenChat(persona)}
          />
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          disabled={analysisFlow.isPending || (!analysisFlow.pricingUrl && !analysisFlow.pricingImageBase64)}
          onClick={() => analysisFlow.handleAnalyzePricing(personas)}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-foreground px-8 text-sm font-semibold text-background shadow transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {analysisFlow.isPending ? "Listening..." : "Begin Observation"}
        </button>
      </div>

      {analysisFlow.error && (
        <div className="bg-destructive/10 text-destructive text-sm font-medium p-4 rounded-xl border border-destructive/20 mt-4">
          {analysisFlow.error}
        </div>
      )}

      <PersonaDetailModal
        persona={selectedPersona ?? null}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onChatClick={handleOpenChat}
      />

      {selectedPersona && (
        <PersonaChat
          persona={selectedPersona}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  )
}