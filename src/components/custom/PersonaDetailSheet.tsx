"use client"

import * as React from "react"
import { Persona } from "@/domain/entities/Persona"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { PersonaAvatar } from "./PersonaAvatar"
import { PersonaChatInline } from "@/ui/dashboard/components/chat/PersonaChatInline"
import { MessageSquare, User, Search, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface PersonaDetailSheetProps {
  persona: Persona | null
  isOpen: boolean
  onClose: () => void
  defaultTab?: "profile" | "chat"
}

type Tab = "profile" | "chat"

export function PersonaDetailSheet({
  persona,
  isOpen,
  onClose,
  defaultTab = "profile",
}: PersonaDetailSheetProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>(defaultTab)
  const [searchTerm, setSearchTerm] = React.useState("")

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab)
    }
  }, [isOpen, defaultTab])

  const allParagraphs = React.useMemo(() =>
    persona?.backstory ? persona.backstory.split('\n\n') : [],
    [persona?.backstory]
  )

  const filteredBackstory = React.useMemo(() => {
    if (!searchTerm) return allParagraphs
    return allParagraphs.filter(paragraph =>
      paragraph.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [allParagraphs, searchTerm])

  if (!persona) return null

  const renderScalar = (label: string, value: number, leftLabel: string, rightLabel: string) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold font-mono">{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
      <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="fixed right-0 top-0 h-dvh w-full sm:w-[500px] md:w-[600px] lg:w-[680px] max-w-full translate-x-0 translate-y-0 rounded-none border-l border-border bg-background p-0 m-0 flex flex-col"
      >
        <DialogTitle className="sr-only">
          {persona.name} — Profile &amp; Chat
        </DialogTitle>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <PersonaAvatar name={persona.name} size="md" className="w-10 h-10 shrink-0" />
            <div className="flex flex-col min-w-0">
              <h2 className="text-base font-semibold tracking-tight truncate">{persona.name}</h2>
              <p className="text-xs text-muted-foreground truncate">{persona.occupation}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4 shrink-0">
            <button
              onClick={() => setActiveTab("profile")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "profile"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="w-3.5 h-3.5" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "chat"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
            <div className="w-px h-5 bg-border/40 mx-1" />
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              aria-label="Close"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-5 flex flex-col gap-5">

              {/* AI Insight */}
              {persona.aiInsight && (
                <div className="p-4 md:p-5 rounded-lg bg-primary/10 border border-border">
                  <h4 className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    AI INSIGHT
                  </h4>
                  <p className="text-sm md:text-base font-medium leading-relaxed italic text-foreground/90">
                    &ldquo;{persona.aiInsight}&rdquo;
                  </p>
                </div>
              )}

              {/* Quick Info */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{persona.age} years old</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>{persona.educationLevel}</span>
                {persona.decisionStyle && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span>{persona.decisionStyle} decider</span>
                  </>
                )}
              </div>

              {/* Backstory */}
              <div className="flex flex-col gap-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">THE BACKSTORY VAULT</h4>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                  <Input
                    placeholder="Search backstory..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 text-xs pl-8 rounded-md bg-muted/30 border-none transition-all focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div className="flex flex-col gap-4 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredBackstory.map((paragraph, i) => (
                    <p
                      key={`${persona.id}-para-${i}`}
                      className={cn(
                        "text-xs md:text-[13px] leading-relaxed text-foreground/80",
                        searchTerm && paragraph.toLowerCase().includes(searchTerm.toLowerCase())
                          ? "bg-primary/10 rounded-lg p-2 text-foreground font-medium ring-1 ring-primary/20" : ""
                      )}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Goals */}
              {persona.goals.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">GOALS</h4>
                  <ul className="space-y-2">
                    {persona.goals.map((goal, i) => (
                      <li key={`${persona.id}-goal-${i}`} className="text-xs md:text-sm flex gap-2 leading-relaxed">
                        <span className="text-primary font-bold shrink-0">•</span>
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Big Five */}
              <div className="flex flex-col gap-4">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">THE ENGINE</h4>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Big Five (OCEAN) — Joshi et al. (2025)</p>
                <div className="space-y-4">
                  {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                  {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                  {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                  {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                  {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                </div>
              </div>

              {/* Psychographic */}
              <div className="flex flex-col gap-4">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PSYCHOGRAPHIC SPECIFICATION</h4>
                {persona.values && persona.values.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Values</span>
                    <div className="flex flex-wrap gap-1.5">
                      {persona.values.map((v, i) => (
                        <span key={i} className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-sm">{v}</span>
                      ))}
                    </div>
                  </div>
                )}
                {persona.fears && persona.fears.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Fears</span>
                    <ul className="space-y-1.5">
                      {persona.fears.map((f, i) => (
                        <li key={i} className="text-xs md:text-sm flex gap-2 leading-relaxed text-foreground/80">
                          <span className="text-destructive shrink-0">•</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {persona.communicationStyle && (
                  <div className="flex items-center justify-between py-2 border-t border-border/20">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Communication</span>
                    <span className="text-xs md:text-sm font-medium capitalize">{persona.communicationStyle}</span>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Chat Tab */}
        {activeTab === "chat" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <PersonaChatInline persona={persona} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
