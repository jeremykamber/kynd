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
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] md:w-[90vw] lg:max-w-7xl xl:max-w-[1400px] p-0 border-none bg-background/70 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        <motion.div 
          className="flex flex-col min-h-full"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {/* Header Section */}
          <div className="p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-6 items-start justify-between border-b border-border/40 bg-background/50">
            <div className="flex gap-4 md:gap-6 items-center">
              <PersonaAvatar name={persona.name} size="xl" className="w-16 h-16 md:w-24 md:h-24 shadow-lg border-2 border-background shrink-0" />
              <div className="flex flex-col gap-1 min-w-0">
                <DialogTitle className="text-2xl md:text-4xl font-bold tracking-tight truncate">{persona.name}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground font-medium">
                  <span>{persona.age} years old</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="truncate max-w-[120px] md:max-w-none">{persona.occupation}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="truncate max-w-[120px] md:max-w-none">{persona.educationLevel}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 justify-end">
              <Button variant="outline" size="sm" className="h-8 md:h-10 gap-2 rounded-full border-border/60 text-xs md:text-sm px-3 md:px-4" onClick={() => console.log("Export PDF for", persona.name)}>
                <FileDown className="w-3.5 h-3.5 md:w-4 h-4" />
                <span className="hidden sm:inline">Export PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              {onChatClick && (
                <Button size="sm" className="h-8 md:h-10 gap-2 rounded-full shadow-md text-xs md:text-sm px-3 md:px-4" onClick={() => onChatClick(persona)}>
                  <MessageSquare className="w-3.5 h-3.5 md:w-4 h-4" />
                  Chat
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-6 pb-12">
              
              {/* AI Insight - Full Width Top */}
              {persona.aiInsight && (
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.002 }}
                  className="grid-cols-1 md:col-span-2 lg:col-span-12 p-5 md:p-8 rounded-2xl bg-primary/5 border border-primary/20 relative overflow-hidden group shadow-inner"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                    <div className="w-24 h-24 rounded-full bg-primary/20 blur-3xl" />
                  </div>
                  <h4 className="text-[10px] md:text-xs font-bold text-primary uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    AI Behavioral Insight
                  </h4>
                  <p className="text-base md:text-xl font-medium leading-relaxed italic text-foreground/90">
                    "{persona.aiInsight}"
                  </p>
                </motion.div>
              )}

              {/* Left Column: Human DNA */}
              <div className="grid-cols-1 md:col-span-1 lg:col-span-4 flex flex-col gap-4 md:gap-6">
                {/* Goals & Interests */}
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  className="p-5 md:p-6 rounded-2xl bg-card/40 border border-border/40 shadow-sm flex flex-col gap-6 backdrop-blur-sm"
                >
                  <div>
                    <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Core Goals</h4>
                    <ul className="space-y-3">
                      {persona.goals.map((goal, i) => (
                        <li key={`${persona.id}-goal-${i}`} className="text-xs md:text-sm flex gap-2 leading-relaxed">
                          <span className="text-primary font-bold shrink-0">•</span>
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Interests</h4>
                    <div className="flex flex-wrap gap-1.5 md:gap-2">
                      {persona.interests.map((interest, i) => (
                        <Badge key={`${persona.id}-interest-${i}`} variant="secondary" className="font-normal rounded-md text-[10px] md:text-xs px-2 py-0.5">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Aesthetic DNA */}
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  className="p-5 md:p-6 rounded-2xl bg-card/40 border border-border/40 shadow-sm backdrop-blur-sm"
                >
                  <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Aesthetic DNA</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] md:text-xs text-muted-foreground">Style</span>
                      <span className="text-xs md:text-sm font-semibold">{persona.designStyle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] md:text-xs text-muted-foreground">Environment</span>
                      <span className="text-[10px] md:text-xs font-medium text-right max-w-[150px] leading-tight">{persona.livingEnvironment}</span>
                    </div>
                    <div>
                      <span className="text-[10px] md:text-xs text-muted-foreground block mb-3">Favorite Colors</span>
                      <div className="flex gap-2.5">
                        {persona.favoriteColors.map((color, i) => (
                          <div 
                            key={`${persona.id}-color-${i}`} 
                            className="w-7 h-7 md:w-9 md:h-9 rounded-full border border-border/40 shadow-inner transition-transform hover:scale-110 active:scale-95" 
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Center Column: Cognitive Engine */}
              <div className="grid-cols-1 md:col-span-1 lg:col-span-4 flex flex-col gap-4 md:gap-6">
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  className="p-5 md:p-6 rounded-2xl bg-card/40 border border-border/40 shadow-sm flex flex-col gap-8 backdrop-blur-sm h-full"
                >
                  <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Cognitive Engine</h4>
                  
                  <div className="space-y-6">
                    {renderScalar("Cognitive Reflex", persona.cognitiveReflex, "Intuitive", "Analytical")}
                    {renderScalar("Technical Fluency", persona.technicalFluency, "Luddite", "Hacker")}
                    {renderScalar("Economic Sensitivity", persona.economicSensitivity, "Value Blind", "Penny Pincher")}
                  </div>
                  
                  <div className="h-px bg-border/40" />

                  <div className="flex flex-col gap-5">
                    <h4 className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Big Five Profile</h4>
                    <div className="space-y-5">
                      {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                      {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                      {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                      {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                      {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Right Column: Backstory Vault */}
              <div className="grid-cols-1 md:col-span-2 lg:col-span-4 flex flex-col gap-4 md:gap-6">
                <motion.div 
                  variants={itemVariants}
                  whileHover={{ scale: 1.01 }}
                  className="flex flex-col h-full min-h-[400px] lg:min-h-0 p-5 md:p-6 rounded-2xl bg-card/40 border border-border/40 shadow-sm overflow-hidden backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Backstory Vault</h4>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                      <Input 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 w-28 md:w-32 text-[10px] md:text-xs pl-8 rounded-full bg-muted/30 border-none transition-all focus:ring-1 focus:ring-primary/20 focus:w-36 md:focus:w-44"
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
              </div>
            </div>
          </ScrollArea>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
