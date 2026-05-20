import * as React from "react"
import { cn } from "@/lib/utils"
import { MinimalCard } from "./MinimalCard"
import { PersonaAvatar } from "./PersonaAvatar"
import { StatusBadge } from "./StatusBadge"

import { Persona } from "@/domain/entities/Persona"

export interface PersonaProfilePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  persona: Persona
  onChatClick?: () => void
}

export function PersonaProfilePanel({ persona, onChatClick, className, ...props }: PersonaProfilePanelProps) {
  return (
    <MinimalCard className={cn("flex flex-col gap-6 h-full", className)} hoverable {...props}>
      <div className="flex items-start gap-5">
        <PersonaAvatar
          name={persona.name}
          imageUrl={(persona as any).imageUrl}
          size="lg"
          className="shadow-sm"
        />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold text-xl tracking-tight text-foreground truncate">{persona.name}</h3>
          </div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest truncate">{persona.occupation}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="h-px w-full bg-border/40" />

        <div className="flex flex-col gap-3">
          {/* Big Five: show the two most distinctive traits */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Conscientiousness</span>
              <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.conscientiousness}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full" style={{ width: `${persona.conscientiousness}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60 font-medium uppercase">
              <span>Chaotic</span>
              <span>Meticulous</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Neuroticism</span>
              <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.neuroticism}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full" style={{ width: `${persona.neuroticism}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60 font-medium uppercase">
              <span>Stable</span>
              <span>Anxious</span>
            </div>
          </div>

          {/* Psychographic snapshot */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {persona.values?.slice(0, 2).map((v, i) => (
              <span key={i} className="text-[9px] font-medium text-primary/80 bg-primary/5 px-2 py-0.5 rounded-full truncate max-w-[100px]">
                {v}
              </span>
            ))}
          </div>
          {persona.decisionStyle && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Decides:</span>
              <span className="text-[10px] font-semibold text-foreground/80 truncate">{persona.decisionStyle}</span>
            </div>
          )}
        </div>
      </div>

      {onChatClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChatClick()
          }}
          className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-lg bg-secondary/50 px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none"
        >
          Chat with {persona.name.split(' ')[0]}
        </button>
      )}
    </MinimalCard>
  )
}
