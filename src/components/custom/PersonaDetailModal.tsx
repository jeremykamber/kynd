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

  if (!persona) return null

  const filteredBackstory = persona.backstory
    ? persona.backstory.split('\n\n')
    : []

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden border-none bg-background/70 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col h-[90vh] md:h-[80vh]">
          {/* Header Section */}
          <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start justify-between border-b border-border/40 bg-background/50">
            <div className="flex gap-6 items-center">
              <PersonaAvatar name={persona.name} size="xl" className="shadow-lg border-2 border-background" />
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-3xl font-bold tracking-tight">{persona.name}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground font-medium">
                  <span>{persona.age} years old</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{persona.occupation}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{persona.educationLevel}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 self-end md:self-start">
              <Button variant="outline" size="sm" className="gap-2 rounded-full border-border/60" onClick={() => console.log("Export PDF for", persona.name)}>
                <FileDown className="w-4 h-4" />
                Export PDF
              </Button>
              {onChatClick && (
                <Button size="sm" className="gap-2 rounded-full shadow-md" onClick={() => onChatClick(persona)}>
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 pb-12">
              
              {/* AI Insight - Full Width Top */}
              {persona.aiInsight && (
                <div className="md:col-span-12 p-6 rounded-2xl bg-primary/5 border border-primary/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-20">
                    <div className="w-12 h-12 rounded-full bg-primary/20 blur-xl" />
                  </div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    AI Behavioral Insight
                  </h4>
                  <p className="text-lg font-medium leading-relaxed italic text-foreground/90">
                    "{persona.aiInsight}"
                  </p>
                </div>
              )}

              {/* Left Column: Human DNA */}
              <div className="md:col-span-4 flex flex-col gap-6">
                {/* Goals & Interests */}
                <div className="p-6 rounded-2xl bg-card border border-border/40 shadow-sm flex flex-col gap-6">
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Core Goals</h4>
                    <ul className="space-y-2">
                      {persona.goals.map((goal, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-primary font-bold">•</span>
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Interests</h4>
                    <div className="flex flex-wrap gap-2">
                      {persona.interests.map((interest, i) => (
                        <Badge key={i} variant="secondary" className="font-normal rounded-md">
                          {interest}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Aesthetic DNA */}
                <div className="p-6 rounded-2xl bg-card border border-border/40 shadow-sm">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Aesthetic DNA</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Style</span>
                      <span className="text-sm font-semibold">{persona.designStyle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Environment</span>
                      <span className="text-xs font-medium text-right max-w-[150px]">{persona.livingEnvironment}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block mb-2">Favorite Colors</span>
                      <div className="flex gap-2">
                        {persona.favoriteColors.map((color, i) => (
                          <div 
                            key={i} 
                            className="w-8 h-8 rounded-full border border-border/40 shadow-inner" 
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Column: Cognitive Engine */}
              <div className="md:col-span-4 flex flex-col gap-6">
                <div className="p-6 rounded-2xl bg-card border border-border/40 shadow-sm flex flex-col gap-8">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Cognitive Engine</h4>
                  
                  {renderScalar("Cognitive Reflex", persona.cognitiveReflex, "Intuitive", "Analytical")}
                  {renderScalar("Technical Fluency", persona.technicalFluency, "Luddite", "Hacker")}
                  {renderScalar("Economic Sensitivity", persona.economicSensitivity, "Value Blind", "Penny Pincher")}
                  
                  <div className="h-px bg-border/40" />

                  <div className="flex flex-col gap-5">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Big Five Profile</h4>
                    {renderScalar("Conscientiousness", persona.conscientiousness, "Chaotic", "Meticulous")}
                    {renderScalar("Neuroticism", persona.neuroticism, "Stable", "Anxious")}
                    {renderScalar("Openness", persona.openness, "Traditional", "Curious")}
                    {renderScalar("Extraversion", persona.extraversion, "Introvert", "Extrovert")}
                    {renderScalar("Agreeableness", persona.agreeableness, "Competitive", "Compassionate")}
                  </div>
                </div>
              </div>

              {/* Right Column: Backstory Vault */}
              <div className="md:col-span-4 flex flex-col gap-6">
                <div className="flex flex-col h-full p-6 rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Backstory Vault</h4>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
                      <Input 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-7 w-24 text-[10px] pl-7 rounded-full bg-muted/30 border-none"
                      />
                    </div>
                  </div>
                  
                  <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="flex flex-col gap-4">
                      {filteredBackstory.map((paragraph, i) => {
                        const isMatch = searchTerm && paragraph.toLowerCase().includes(searchTerm.toLowerCase())
                        return (
                          <p 
                            key={i} 
                            className={cn(
                              "text-[13px] leading-relaxed text-foreground/80 transition-colors duration-300",
                              isMatch ? "bg-primary/10 rounded px-1 text-foreground" : ""
                            )}
                          >
                            {paragraph}
                          </p>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
