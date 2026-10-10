"use client"

import { useState } from "react"
import { ChevronRight, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThinkingBlockProps {
  content: string
  className?: string
}

/**
 * Collapsible view of an assistant's reasoning text. Starts collapsed and
 * shows the character count as a size hint next to the toggle.
 */
export function ThinkingBlock({ content, className }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground/70 hover:text-muted-foreground/90 transition-colors py-2 px-0 w-fit"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        <Brain className="w-3 h-3" />
        <span className="micro-label">Thinking</span>
        <span className="text-xs font-mono tabular-nums text-muted-foreground/40">({content.length} chars)</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-5 border-l-2 border-muted-foreground/20 py-2 pl-4">
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground/70 whitespace-pre-wrap font-mono">
            {content}
          </p>
        </div>
      )}
    </div>
  )
}
