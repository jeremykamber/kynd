"use client"

import * as React from "react"
import { Persona } from "@/domain/entities/Persona"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PersonaAvatar } from "./PersonaAvatar"
import { FileDown, Search, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface PersonaDetailModalProps {
  persona: Persona | null
  isOpen: boolean
  onClose: () => void
  onChatClick?: (persona: Persona) => void
}

export function PersonaDetailModal({
  persona,
  isOpen,
  onClose,
  onChatClick
}: PersonaDetailModalProps) {
  const [searchTerm, setSearchTerm] = React.useState("")

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
        <span className="text-sm font-bold">{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
      <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1] as any,
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1] as any
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] md:w-[90vw] lg:max-w-7xl xl:max-w-[1400px] p-0 border-none bg-background/70 backdrop-blur-xl shadow-2xl ring-1 ring-[rgba(26,26,27,0.1] max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        <motion.div
          className="flex flex-col min-h-full"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <div className="p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 items-start justify-between border-b border-[rgba(26,26,27,0.1)] bg-background/50">
            <div className="flex gap-4 md:gap-6 items-center">
              <PersonaAvatar name={persona.name} size="xl" className="w-16 h-16 md:w-24 md:h-24 shadow-lg border-2 border-background shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <DialogTitle className="text-2xl md:text-4xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-fraunces)' }}>{persona.name}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground font-medium">
                  <span>{persona.age} years old</span>
                  <span className="w-1 h-1 rounded-full bg-[rgba(26,26,27,0.2)]" />
                  <span className="truncate max-w-[120px] md:max-w-none">{persona.occupation}</span>
                  <span className="w-1 h-1 rounded-full bg-[rgba(26,26,27,0.2)]" />
                  <span className="truncate max-w-[120px] md:max-w-none">{persona.educationLevel}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 justify-end">
              <Button variant="outline" size="sm" className="h-8 md:h-10 gap-2 rounded-xl border-[rgba(26,26,27,0.15)] text-xs md:text-sm px-3 md:px-4" onClick={() => console.log("Export PDF for", persona.name)}>
                <FileDown className="w-3.5 h-3.5 md:w-4 h-4" />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              {onChatClick && (
                <Button size="sm" className="h-8 md:h-10 gap-2 rounded-xl shadow-md text-xs md:text-sm px-3 md:px-4" onClick={() => onChatClick(persona)}>
                  <MessageSquare className="w-3.5 h-3.5 md:w-4 h-4" />
                  Talk
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 pb-12">

              {persona.aiInsight && (
                <motion.div
                  variants={itemVariants}
                  className="lg:col-span-2 p-5 md:p-8 rounded-2xl bg-ink/5 border border-[rgba(26,26,27,0.1)] relative overflow-hidden group shadow-inner transition-all duration-400 hover:border-[rgba(26,26,27,0.15)]"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                    <div className="w-24 h-24 rounded-full bg-foreground/10 blur-3xl" />
                  </div>
                  <h4 className="text-[10px] md:text-xs font-bold text-foreground uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-kynd-pulse" />
                    Their insight
                  </h4>
                  <p className="text-base md:text-xl font-medium leading-relaxed italic text-foreground/90">
                    &quot;{persona.aiInsight}&quot;
                  </p>
                </motion.div>
              )}

              <div className="flex flex-col gap-4 md:gap-6">
                <motion.div
                  variants={itemVariants}
                  className="flex flex-col h-[400px] p-5 md:p-6 rounded-2xl bg-card border border-[rgba(26,26,27,0.08)] shadow-sm overflow-hidden transition-all duration-400 hover:border-[rgba(26,26,27,0.12)]"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Their story</h4>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                      <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 w-32 md:w-36 text-[10px] md:text-xs pl-8 rounded-full bg-muted/30 border-none transition-all focus:ring-1 focus:ring-foreground/10"
                      />
                    </div>
                  </div>

                  <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="flex flex-col gap-5">
                      {filteredBackstory.map((paragraph, i) => {
                        const isMatch = searchTerm && paragraph.toLowerCase().includes(searchTerm.toLowerCase())
                        return (
                          <p
                            key={`${persona.id}-para-${i}`}
                            className={cn(
                              "text-xs md:text-[13px] leading-relaxed text-foreground/80 transition-colors duration-300",
                              isMatch ? "bg-ink/5 rounded-lg p-2 text-foreground font-medium ring-1 ring-ink/10" : ""
                            )}
                          >
                            {paragraph}
                          </p>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="p-5 md:p-6 rounded-2xl bg-card border border-[rgba(26,26,27,0.08)] shadow-sm flex flex-col gap-6 transition-all duration-400 hover:border-[rgba(26,26,27,0.12)]"
                >
                  <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">What they want</h4>
                  <ul className="space-y-3">
                    {persona.goals.map((goal, i) => (
                      <li key={`${persona.id}-goal-${i}`} className="text-xs md:text-sm flex gap-2 leading-relaxed">
                        <span className="text-foreground font-bold shrink-0">•</span>
                        {goal}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </div>

              <div className="flex flex-col gap-4 md:gap-6">
                <motion.div
                  variants={itemVariants}
                  className="p-5 md:p-6 rounded-2xl bg-card border border-[rgba(26,26,27,0.08)] shadow-sm flex flex-col gap-8 h-full transition-all duration-400 hover:border-[rgba(26,26,27,0.12)]"
                >
                  <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">How they work</h4>

                  <div className="space-y-6">
                    {renderScalar("TECH FLUENCY", persona.technicalFluency, "Intuitive", "Technical")}
                    {renderScalar("DECISION STYLE", persona.neuroticism, "Confident", "Considered")}
                    {renderScalar("COG REFLEX", persona.cognitiveReflex, "Intuitive", "Analytical")}
                  </div>

                  <div className="h-px bg-[rgba(26,26,27,0.08)]" />

                  <div className="flex flex-col gap-5">
                    <h4 className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-2">Core traits</h4>
                    <div className="space-y-5">
                      {renderScalar("Conscientiousness", persona.conscientiousness, "Spontaneous", "Deliberate")}
                      {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                      {renderScalar("Extraversion", persona.extraversion, "Reserved", "Outgoing")}
                      {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Collaborative")}
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  className="p-5 md:p-6 rounded-2xl bg-card border border-[rgba(26,26,27,0.08)] shadow-sm transition-all duration-400 hover:border-[rgba(26,26,27,0.12)]"
                >
                  <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Their taste</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] md:text-xs text-muted-foreground">Style</span>
                      <span className="text-xs md:text-sm font-semibold">{persona.designStyle}</span>
                    </div>
                  </div>
                </motion.div>
              </div>

            </div>
          </ScrollArea>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}