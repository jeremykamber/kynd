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
        <div className="h-px w-full bg-[rgba(26,26,27,0.08)]" />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Tech Fluency</span>
              <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.technicalFluency}%</span>
            </div>
            <div className="h-1.5 w-full bg-[rgba(26,26,27,0.05)] rounded-full overflow-hidden">
              <div className="h-full bg-foreground rounded-full" style={{ width: `${persona.technicalFluency}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60 font-medium uppercase">
              <span>Intuitive</span>
              <span>Technical</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Decision Style</span>
              <span className="text-xs font-bold font-variant-numeric tabular-nums">{persona.neuroticism}%</span>
            </div>
            <div className="h-1.5 w-full bg-[rgba(26,26,27,0.05)] rounded-full overflow-hidden">
              <div className="h-full bg-foreground rounded-full" style={{ width: `${persona.neuroticism}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60 font-medium uppercase">
              <span>Confident</span>
              <span>Considered</span>
            </div>
          </div>
        </div>
      </div>

      {onChatClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChatClick()
          }}
          className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-lg bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none"
        >
          Talk to {persona.name.split(' ')[0]}
        </button>
      )}
    </MinimalCard>
  )
}