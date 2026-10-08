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

/**
 * Read-only persona inspector: backstory (searchable), goals, Big Five and
 * psychographic traits, with an optional export button and chat hand-off.
 * The wider, richer twin of `PersonaDetailSheet`; returns null without a
 * persona and does not itself mutate anything.
 */
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
        <span className="micro-label text-muted-foreground/70">{label}</span>
        <span className="text-sm font-semibold font-mono tabular-nums">{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
      <div className="flex justify-between text-xs text-muted-foreground/80 font-medium">
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
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] as const,
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] as const
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] md:w-[90vw] lg:max-w-7xl xl:max-w-[1400px] p-0 bg-background border border-border max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        <motion.div
          className="flex flex-col min-h-full"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <div className="p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 items-start justify-between border-b border-border/40 bg-background">
            <div className="flex gap-4 md:gap-6 items-center">
              <PersonaAvatar name={persona.name} size="xl" className="w-16 h-16 md:w-24 md:h-24 border-2 border-background shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <DialogTitle className="text-xl font-semibold tracking-tight break-words">{persona.name}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1 micro-label text-muted-foreground/80">
                  <span>{persona.age} years old</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="break-words">{persona.occupation}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="break-words">{persona.educationLevel}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 justify-end">
              <Button variant="outline" size="sm" className="h-8 md:h-10 gap-2 rounded-md border-border/60 text-sm px-3 md:px-4">
                <FileDown className="w-3.5 h-3.5 md:w-4 h-4" />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              {onChatClick && (
                <Button size="sm" className="h-8 md:h-10 gap-2 rounded-md text-sm px-3 md:px-4" onClick={() => onChatClick(persona)}>
                  <MessageSquare className="w-3.5 h-3.5 md:w-4 h-4" />
                  Chat
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 pb-12">

              <div className="flex flex-col gap-4 md:gap-6">
                <motion.div
                  variants={itemVariants}
                  className="flex flex-col h-[400px] p-5 md:p-6 rounded-lg bg-card border border-border overflow-hidden transition-colors duration-150 hover:border-border"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="micro-label text-muted-foreground/70">THE BACKSTORY VAULT</h4>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/70" />
                      <Input
                        placeholder="Search backstory..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 w-32 md:w-36 text-sm pl-8 rounded-md bg-muted/30 border-none transition-all focus:ring-1 focus:ring-primary/20"
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
                              "text-base leading-relaxed text-foreground/80 transition-colors duration-300",
                              isMatch ? "bg-primary/10 rounded-lg p-2 text-foreground font-medium ring-1 ring-primary/20" : ""
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
                  className="p-5 md:p-6 rounded-lg bg-card border border-border flex flex-col gap-3 transition-colors duration-150 hover:border-border"
                >
                  <h4 className="micro-label text-muted-foreground/70">GOALS</h4>
                  <ul className="space-y-3">
                    {persona.goals.map((goal, i) => (
                      <li key={`${persona.id}-goal-${i}`} className="text-sm flex gap-2 leading-snug">
                        <span className="text-primary font-medium shrink-0">•</span>
                        {goal}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </div>

              <div className="flex flex-col gap-4 md:gap-6">
                <motion.div
                  variants={itemVariants}
                  className="p-5 md:p-6 rounded-lg bg-card border border-border flex flex-col gap-4 h-full transition-colors duration-150 hover:border-border"
                >
                  <h4 className="micro-label text-muted-foreground/70">THE ENGINE</h4>

                  <div className="space-y-2">
                    <h4 className="micro-label text-muted-foreground/70">Big Five (OCEAN) — Joshi et al. (2025)</h4>
                    <div className="space-y-4">
                      {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                      {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                      {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                      {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                      {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                    </div>
                  </div>
                </motion.div>

                {/* Psychographic Specification — Wang et al. (2024b) */}
                <motion.div
                  variants={itemVariants}
                  className="p-5 md:p-6 rounded-lg bg-card border border-border transition-colors duration-150 hover:border-border"
                >
                  <h4 className="micro-label text-muted-foreground/70 mb-4">PSYCHOGRAPHIC SPECIFICATION</h4>
                  <div className="flex flex-col gap-4">
                    {persona.values && persona.values.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="micro-label text-muted-foreground/70">Values</span>
                        <div className="flex flex-wrap gap-1.5">
                          {persona.values.map((v, i) => (
                            <span key={i} className="text-sm font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-sm">{v}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {persona.fears && persona.fears.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="micro-label text-muted-foreground/70">Fears</span>
                        <ul className="space-y-1.5">
                          {persona.fears.map((f, i) => (
                            <li key={i} className="text-sm flex gap-2 leading-snug text-foreground/80">
                              <span className="text-destructive shrink-0">•</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {persona.communicationStyle && (
                      <div className="flex items-center justify-between py-2 border-t border-border/20">
                        <span className="micro-label text-muted-foreground/70">Communication</span>
                        <span className="text-sm font-medium capitalize">{persona.communicationStyle}</span>
                      </div>
                    )}
                    {persona.decisionStyle && (
                      <div className="flex items-center justify-between py-2 border-t border-border/20">
                        <span className="micro-label text-muted-foreground/70">Decision Style</span>
                        <span className="text-sm font-medium capitalize">{persona.decisionStyle}</span>
                      </div>
                    )}
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
