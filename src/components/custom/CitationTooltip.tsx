"use client"

import * as React from "react"
import { BookOpenIcon } from "lucide-react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PersonaAvatar } from "./PersonaAvatar"

export interface EvidenceCitation {
  personaId: string
  personaName: string
  /** VERBATIM substring of that persona's rawAnalysis. */
  quote: string
}

export interface CitationTooltipProps {
  citations: EvidenceCitation[]
  /** Opens the Raw Think-Aloud drawer; receives the citation whose quote to highlight. */
  onOpenTranscript: (citation: EvidenceCitation) => void
  /** Role line shown in the popover when the caller can supply one (e.g. personaProfile.occupation). */
  getPersonaRole?: (citation: EvidenceCitation) => string | undefined
}

/**
 * Grace given to pointer travel between the badge and the portaled card. The
 * card sits `sideOffset={4}` away in a `document.body` portal, so the leave
 * event fires while the pointer is still crossing the gap to reach
 * "View full transcript". Closing on that event is what stranded the button.
 */
const HOVER_CLOSE_GRACE_MS = 120

/** True when `node` sits inside the trigger or the card for `key`. */
function isInsideCitation(key: string, node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(`[data-citation-key="${key}"]`) !== null
}

/**
 * The ONLY place that knows what a citation badge looks like.
 *
 * Open model: HoverCard previews on hover/focus, and pressing the badge
 * "pins" the card so it survives pointer-leave (touch has no hover at all).
 * Hover open/close is owned here rather than left to HoverCard because Radix
 * delays hover-open by 700ms; a citation preview should be immediate.
 * HoverCard is also not backed by DismissableLayer, so pinned-card dismissal
 * — outside press and Escape — is wired here, scoped by a data-citation-key
 * attribute shared between trigger and card.
 *
 * Hover close is deferred by HOVER_CLOSE_GRACE_MS and cancelled by the card's
 * own pointer-enter/focus, so moving into the card to press a button keeps it
 * open. Blur, the keyboard equivalent, skips closing when focus lands inside
 * the same citation subtree.
 */
export function CitationTooltip({
  citations,
  onOpenTranscript,
  getPersonaRole,
}: CitationTooltipProps) {
  const [hoverKey, setHoverKey] = React.useState<string | null>(null)
  const [pinnedKey, setPinnedKey] = React.useState<string | null>(null)

  // Pending hover-close, armed when the pointer/focus leaves the trigger and
  // disarmed when either enters the card. Shared across citations: entering
  // any badge or card cancels the close the previous one scheduled.
  const closeTimer = React.useRef<number | null>(null)

  const cancelPreviewClose = React.useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  React.useEffect(() => cancelPreviewClose, [cancelPreviewClose])

  const closePreview = React.useCallback(
    (key: string) => {
      cancelPreviewClose()
      setHoverKey((prev) => (prev === key ? null : prev))
    },
    [cancelPreviewClose]
  )

  const schedulePreviewClose = React.useCallback(
    (key: string) => {
      cancelPreviewClose()
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null
        setHoverKey((prev) => (prev === key ? null : prev))
      }, HOVER_CLOSE_GRACE_MS)
    },
    [cancelPreviewClose]
  )

  const openPreview = React.useCallback(
    (key: string) => {
      cancelPreviewClose()
      setHoverKey(key)
    },
    [cancelPreviewClose]
  )

  // Focus leaves the preview only when it moves somewhere outside this
  // citation's trigger+card subtree. Focus moving between the two (badge →
  // "View full transcript") keeps the card open.
  const blurPreview = (key: string, related: EventTarget | null) => {
    if (pinnedKey === key || isInsideCitation(key, related)) return
    closePreview(key)
  }

  // Pinned-card dismissal. HoverCard never closes itself against outside
  // presses; listening on the document keeps the trigger press (the click's
  // own mousedown) from unpinning what it just pinned, because the press
  // target sits inside the [data-citation-key] subtree.
  React.useEffect(() => {
    if (!pinnedKey) return
    const onDocPointerDown = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest(`[data-citation-key="${pinnedKey}"]`)) {
        return
      }
      setPinnedKey(null)
      setHoverKey(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedKey(null)
    }
    document.addEventListener("pointerdown", onDocPointerDown)
    document.addEventListener("mousedown", onDocPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown)
      document.removeEventListener("mousedown", onDocPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [pinnedKey])

  return (
    <>
      {citations.map((citation) => {
        const citationKey = `${citation.personaId}:${citation.quote.slice(0, 24)}`
        const open = hoverKey === citationKey || pinnedKey === citationKey
        return (
          <HoverCard key={citationKey} open={open} onOpenChange={() => {}}>
            <HoverCardTrigger
              asChild
              aria-label={`Show citation from ${citation.personaName}`}
              data-citation-key={citationKey}
              onPointerEnter={() => openPreview(citationKey)}
              onPointerLeave={() => schedulePreviewClose(citationKey)}
              onFocus={() => openPreview(citationKey)}
              onBlur={(event) => blurPreview(citationKey, event.relatedTarget)}
              onPointerDown={() => {
                setPinnedKey((prev) => (prev === citationKey ? null : citationKey))
              }}
            >
              <Badge
                variant="secondary"
                tabIndex={0}
                className="max-w-40 cursor-pointer rounded-sm font-medium normal-case tracking-normal"
              >
                <span className="truncate">{citation.personaName}</span>
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent
              data-citation-key={citationKey}
              className="w-80 max-w-sm p-0"
              onPointerEnter={cancelPreviewClose}
              onPointerLeave={() => schedulePreviewClose(citationKey)}
              onFocus={cancelPreviewClose}
              onBlur={(event) => blurPreview(citationKey, event.relatedTarget)}
            >
              <div className="flex items-center gap-2 border-b border-border/60 p-4">
                <PersonaAvatar name={citation.personaName} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{citation.personaName}</span>
                  {getPersonaRole?.(citation) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {getPersonaRole(citation)}
                    </span>
                  )}
                </div>
              </div>
              <blockquote className="border-l-2 border-primary/40 bg-muted/30 px-4 py-3 text-sm italic leading-relaxed text-foreground/90">
                {citation.quote}
              </blockquote>
              <div className="px-4 pb-4 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onOpenTranscript(citation)
                    setPinnedKey(null)
                    setHoverKey(null)
                  }}
                >
                  <BookOpenIcon data-icon="inline-start" />
                  View full transcript
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </>
  )
}
