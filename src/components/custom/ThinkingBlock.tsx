"use client"

import { useState } from "react"
import { ChevronRight, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThinkingBlockProps {
  content: string
  /**
   * True while the reply this reasoning belongs to is still arriving. The block
   * then holds the live affordance (a climbing character count); when the turn
   * settles it gives way to a quiet "Reasoning" label, so a finished answer can
   * never read as mid-flight.
   */
  streaming?: boolean
  className?: string
}

/**
 * Collapsible view of an assistant's reasoning text. Starts collapsed.
 */
export function ThinkingBlock({ content, streaming = false, className }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-0 w-fit"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        <Brain className={cn("w-3 h-3", streaming && "animate-pulse text-primary/70")} />
        <span className="micro-label">{streaming ? "Thinking" : "Reasoning"}</span>
        {streaming && (
          <span className="text-xs font-mono tabular-nums text-muted-foreground/40">
            ({content.length} chars)
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 ml-5 border-l-2 border-muted-foreground/20 py-2 pl-4">
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
            {content}
          </p>
        </div>
      )}
    </div>
  )
}
