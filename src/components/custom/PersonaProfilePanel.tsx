import * as React from "react"
import { cn } from "@/lib/utils"
import { MinimalCard } from "./MinimalCard"
import { PersonaAvatar } from "./PersonaAvatar"
import { StatusBadge } from "./StatusBadge"

export interface PersonaProfilePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  persona: {
    id: string
    name: string
    title: string
    imageUrl?: string | null
    description: string
    traits?: string[]
  }
  onChatClick?: () => void
}

export function PersonaProfilePanel({ persona, onChatClick, className, ...props }: PersonaProfilePanelProps) {
  return (
    <MinimalCard className={cn("flex flex-col gap-6 h-full", className)} hoverable {...props}>
      <div className="flex items-start gap-5">
        <PersonaAvatar 
          name={persona.name} 
          imageUrl={persona.imageUrl} 
          size="lg" 
          className="shadow-sm"
        />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold text-xl tracking-tight text-foreground">{persona.name}</h3>
          </div>
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{persona.title}</p>
        </div>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="h-px w-full bg-border/40" />
        
        <p className="text-sm text-foreground/80 leading-relaxed text-balance line-clamp-2 min-h-[2.5rem]">
          {persona.description}
        </p>

        {persona.traits && persona.traits.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {persona.traits.map(trait => (
              <StatusBadge key={trait} variant="outline" className="text-xs font-normal px-3 py-1">
                {trait}
              </StatusBadge>
            ))}
          </div>
        )}
      </div>

      {onChatClick && (
        <button
          type="button"
          onClick={onChatClick}
          className="mt-auto w-full inline-flex h-10 items-center justify-center rounded-lg bg-secondary/50 px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary focus-visible:outline-none"
        >
          Chat with {persona.name.split(' ')[0]}
        </button>
      )}
    </MinimalCard>
  )
}
