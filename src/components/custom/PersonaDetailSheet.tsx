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
import { MessageSquare, User, Search, XIcon, CopyIcon, ShuffleIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"
import { VariationFormData } from "./SimilarPersonaDialog"
import { mapToDiscrete } from "./variationMapping"

interface PersonaDetailSheetProps {
  persona: Persona | null
  isOpen: boolean
  onClose: () => void
  defaultTab?: "profile" | "chat" | "variant"
  onCreateVariant?: () => void
  onGenerateVariation?: (referencePersona: Persona, formData: VariationFormData) => void
}

type Tab = "profile" | "chat" | "variant"

export function PersonaDetailSheet({
  persona,
  isOpen,
  onClose,
  defaultTab = "profile",
  onCreateVariant,
  onGenerateVariation,
}: PersonaDetailSheetProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>(defaultTab)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [bigFive, setBigFive] = React.useState({
    conscientiousness: 50,
    neuroticism: 50,
    openness: 50,
    extraversion: 50,
    agreeableness: 50,
  })
  const [variationLevel, setVariationLevel] = React.useState(2)
  const [selectedCount, setSelectedCount] = React.useState<1 | 3 | 5>(3)

  React.useEffect(() => {
    if (persona) {
      setBigFive({
        conscientiousness: mapToDiscrete(persona.conscientiousness),
        neuroticism: mapToDiscrete(persona.neuroticism),
        openness: mapToDiscrete(persona.openness),
        extraversion: mapToDiscrete(persona.extraversion),
        agreeableness: mapToDiscrete(persona.agreeableness),
      })
      setVariationLevel(mapToDiscrete(40))
      setSelectedCount(3)
    }
  }, [persona])

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

  const updateBigFive = (key: keyof typeof bigFive, value: number) => {
    setBigFive((prev) => ({ ...prev, [key]: value }))
  }

  const handleGenerateVariation = () => {
    if (!onGenerateVariation || !persona) return
    console.log("[PersonaDetailSheet] Generating variation - bigFive:", bigFive, "variationLevel:", variationLevel, "count:", selectedCount)
    const mappedFormData: VariationFormData = {
      bigFive: {
        conscientiousness: bigFive.conscientiousness * 20,
        neuroticism: bigFive.neuroticism * 20,
        openness: bigFive.openness * 20,
        extraversion: bigFive.extraversion * 20,
        agreeableness: bigFive.agreeableness * 20,
      },
      variationLevel: variationLevel * 20,
      count: selectedCount,
    }
    console.log("[PersonaDetailSheet] Mapped formData:", mappedFormData)
    onGenerateVariation(persona, mappedFormData)
  }

  const getRandomDiscrete = () => Math.floor(Math.random() * 5) + 1

  const handleRandomizeVariation = () => {
    console.log("[PersonaDetailSheet] Randomizing slider values")
    setBigFive({
      conscientiousness: getRandomDiscrete(),
      neuroticism: getRandomDiscrete(),
      openness: getRandomDiscrete(),
      extraversion: getRandomDiscrete(),
      agreeableness: getRandomDiscrete(),
    })
    setVariationLevel(getRandomDiscrete())
  }

  const BIG_FIVE_CONFIG = [
    { key: "conscientiousness" as const, label: "Conscientiousness", left: "Chaotic", right: "Meticulous" },
    { key: "neuroticism" as const, label: "Neuroticism", left: "Stable", right: "Anxious" },
    { key: "openness" as const, label: "Openness", left: "Traditional", right: "Curious" },
    { key: "extraversion" as const, label: "Extraversion", left: "Introvert", right: "Extrovert" },
    { key: "agreeableness" as const, label: "Agreeableness", left: "Competitive", right: "Compassionate" },
  ]
  const COUNT_OPTIONS = [1, 3, 5] as const

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[600px] md:max-w-[680px] h-[85dvh] overflow-y-auto flex flex-col p-0"
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
            {onCreateVariant && (
              <button
                onClick={() => setActiveTab("variant")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  activeTab === "variant"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CopyIcon className="w-3.5 h-3.5" />
                Variant
              </button>
            )}
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">BIG FIVE TRAITS</h4>
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

        {/* Variant Tab */}
        {activeTab === "variant" && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-5 flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      Big Five Personality Traits
                    </h3>
                    <button
                      type="button"
                      onClick={handleRandomizeVariation}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-card text-foreground border border-border/60 transition-colors hover:bg-muted/30"
                      aria-label="Randomize traits"
                    >
                      <ShuffleIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60">
                    Adjust the personality profile
                  </span>
                </div>
                <div className="space-y-4">
                  {BIG_FIVE_CONFIG.map(({ key, label, left, right }) => (
                    <Slider
                      key={key}
                      label={label}
                      value={bigFive[key]}
                      min={1}
                      max={5}
                      step={1}
                      showTickMarks
                      leftLabel={left}
                      rightLabel={right}
                      onChange={(v) => updateBigFive(key, v)}
                    />
                  ))}
                </div>
              </div>

              <div className="h-px w-full bg-border/40" />

              <Slider
                label="Creative Freedom"
                value={variationLevel}
                min={1}
                max={5}
                step={1}
                showTickMarks
                leftLabel="Close to original"
                rightLabel="Wildly different"
                onChange={setVariationLevel}
              />

              <div className="h-px w-full bg-border/40" />

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    How Many?
                  </h3>
                  <span className="text-[10px] text-muted-foreground/60">
                    Number of variations to generate
                  </span>
                </div>
                <div className="flex gap-3">
                  {COUNT_OPTIONS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSelectedCount(count)}
                      className={cn(
                        "flex-1 h-10 rounded-md text-sm font-medium transition-all border",
                        selectedCount === count
                          ? "bg-muted text-foreground border-border"
                          : "bg-transparent text-muted-foreground border-border hover:border-border/80 hover:text-foreground",
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateVariation}
                disabled={!onGenerateVariation}
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <SparklesIcon className="w-4 h-4" />
                Generate {selectedCount} Variation{selectedCount > 1 ? "s" : ""}
              </button>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
