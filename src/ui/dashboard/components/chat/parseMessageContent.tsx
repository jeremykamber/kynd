import React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { ThinkingBlock } from "@/components/custom/ThinkingBlock"
import { ChatMarkdown } from "./ChatMarkdown"
import { Brain } from "lucide-react"

const REASONING_OPEN = "<<REASONING>>"
const REASONING_CLOSE = "<</REASONING>>"

const REASONING_REGEX = new RegExp(
  `${REASONING_OPEN}([\\s\\S]*?)(?:${REASONING_CLOSE}|$)`,
  "g",
)

interface ReasoningSegment {
  text: string
  start: number
  end: number
}

function extractReasoningSegments(content: string): ReasoningSegment[] {
  const segments: ReasoningSegment[] = []
  REASONING_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REASONING_REGEX.exec(content)) !== null) {
    const text = match[1].trim()
    if (!text) continue
    segments.push({ text, start: match.index, end: REASONING_REGEX.lastIndex })
  }
  return segments
}

interface MemoryFootnote {
  index: number
  text: string
}

/**
 * Strips the quote pair the prompt dialect wraps a statement in
 * (`<% "statement" | … %>`). The quotes are markup, not prose. A lone quote is
 * dropped too, covering a marker that is still streaming (`<% "statement`).
 */
function stripStatementQuotes(inner: string): string {
  const trimmed = inner.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim()
  }
  if (trimmed.startsWith('"') && !trimmed.slice(1).includes('"')) {
    return trimmed.slice(1).trim()
  }
  return trimmed
}

/**
 * Renders a single-segment marker as the statement it wraps.
 *
 * `ChatPromptCompiler` asks for `<% "statement" | "backstory" %>`, where the
 * first segment is the text the user is meant to read; the model frequently
 * drops the second half. Emitting the marker verbatim leaks the prompt dialect
 * into the reply, while deleting it erases words the model authored — so the
 * statement is kept and rendered plainly. A space is added on either side when
 * the model glued the marker to neighbouring prose, so `me.<% "x" %>So` reads
 * as `me. x So` rather than `me.xSo`.
 */
function inlineStatement(body: string, match: RegExpExecArray): string {
  const statement = stripStatementQuotes(match[2])
  const start = match.index
  const before = start > 0 ? body[start - 1] : undefined
  const after = body[start + match[0].length]
  const lead = before !== undefined && !/\s/.test(before) ? " " : ""
  const trail = after !== undefined && !/\s/.test(after) ? " " : ""
  return statement ? `${lead}${statement}${trail}` : lead || trail
}

/**
 * Splits assistant message content into renderable nodes, rendering each
 * non-markup run as markdown.
 *
 * Markup accepted:
 * - `<<REASONING>>…<</REASONING>>` → collapsed ThinkingBlock. An unclosed
 *   opener runs to end of content, covering the mid-stream state.
 * - `<% "statement" %>` — a single-segment marker, or one still streaming with
 *   no closing `%>` — renders `statement` as plain prose. The model often
 *   drops the `|` half of the documented two-part form; the delimiters must
 *   never reach the user.
 * - `<%display|excerpt%>` → dotted-underline tooltip.
 * - `[Memory: text]` → superscript reference, with `text` collected into a
 *   footnote list appended after the body.
 * - `<I text>` → inline "memory" pill whose tooltip shows `text`.
 *
 * Returns nodes in source order — `[]` for empty input. Unrecognised or
 * malformed markers fall through as plain body text.
 */
export function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const memories: MemoryFootnote[] = []
  let keyCounter = 0
  let memoryCounter = 0

  const reasoningSegments = extractReasoningSegments(content)

  const segments: { type: "reasoning" | "body"; text: string }[] = []
  let cursor = 0
  for (const seg of reasoningSegments) {
    if (seg.start > cursor) {
      segments.push({ type: "body", text: content.slice(cursor, seg.start) })
    }
    segments.push({ type: "reasoning", text: seg.text })
    cursor = seg.end
  }
  if (cursor < content.length) {
    segments.push({ type: "body", text: content.slice(cursor) })
  }

  for (const segment of segments) {
    if (segment.type === "reasoning") {
      parts.push(
        <ThinkingBlock key={`reasoning-${keyCounter++}`} content={segment.text} className="mb-3" />
      )
      continue
    }

    const body = segment.text.trim()
    if (!body) continue

    const combinedRegex =
      /(<%([\s\S]*?)(?:%>|$))|(\[Memory:\s*(.*?)\])|(<I\s(.*?)>)/g
    let match = combinedRegex.exec(body)
    let lastIndex = 0

    // Plain prose accumulates in one markdown node, so an inlined
    // single-segment marker reads as part of the sentence around it rather
    // than as a separate node that loses the neighbouring spaces.
    let prose = ""
    const flushProse = () => {
      if (!prose) return
      parts.push(<ChatMarkdown key={`md-${keyCounter++}`} content={prose} />)
      prose = ""
    }

    while (match !== null) {
      prose += body.slice(lastIndex, match.index)

      if (match[1]) {
        const inner = match[2]
        const pipeIndex = inner.indexOf('|')

        if (pipeIndex !== -1) {
          flushProse()
          const displayText = inner.slice(0, pipeIndex).trim()
          const excerpt = inner.slice(pipeIndex + 1).trim()
          parts.push(
            <Tooltip key={`tooltip-${keyCounter++}`} delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="underline underline-offset-2 decoration-dotted cursor-help text-primary/80 hover:text-primary">
                  {displayText}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                <p>{excerpt}</p>
              </TooltipContent>
            </Tooltip>
          )
        } else {
          prose += inlineStatement(body, match)
        }
      } else if (match[3]) {
        flushProse()
        memoryCounter++
        const memoryText = match[4].trim()
        memories.push({ index: memoryCounter, text: memoryText })
        parts.push(
          <sup
            key={`memory-ref-${keyCounter++}`}
            className="text-[10px] text-primary/60 font-medium leading-none mx-[1px] select-none"
          >
            {memoryCounter}
          </sup>
        )
      } else if (match[5]) {
        flushProse()
        const memoryText = match[6].trim()
        parts.push(
          <Tooltip key={`memory-inline-${keyCounter++}`} delayDuration={200}>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted/50 border border-border/40 text-muted-foreground cursor-help hover:bg-muted/70 hover:text-foreground transition-colors">
                <Brain className="w-3 h-3 text-primary" />
                <span>memory</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
              <p>{memoryText}</p>
            </TooltipContent>
          </Tooltip>
        )
      }

      lastIndex = match.index + match[0].length
      match = combinedRegex.exec(body)
    }

    prose += body.slice(lastIndex)
    flushProse()
  }

  if (memories.length > 0) {
    parts.push(
      <div key="memory-footnotes" className="mt-4 pt-3 border-t border-border/30">
        {memories.map((m) => (
          <div key={`fn-${m.index}`} className="flex items-start gap-2 text-xs text-muted-foreground/80 leading-relaxed">
            <sup className="text-[10px] text-primary/60 font-medium leading-none mt-[3px] shrink-0">
              {m.index}
            </sup>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    )
  }

  return parts
}
