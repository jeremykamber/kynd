import * as React from "react"
import { cn, DESTRUCTIVE_CARD_CONTROL_CLASS } from "@/lib/utils"
import { MinimalCard } from "./MinimalCard"
import { PersonaAvatar } from "./PersonaAvatar"
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog"
import { CopyIcon, GitForkIcon, XIcon } from "lucide-react"

import { Persona } from "@/domain/entities/Persona"
import { useAnalysisStore } from "@/ui/stores/analysisStore"
import { pluralize } from "@/lib/pluralize"

export interface PersonaProfilePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  persona: Persona
  onChatClick?: () => void
  onCreateVariant?: () => void
  onDelete?: (personaId: string) => void
}

/**
 * Compact persona card for the batch grid: identity, a labeled goals list and
 * a labeled decision-style line, plus optional delete, create-variant and chat
 * actions. Psychographic detail lives in the persona detail modal/sheet, not
 * here. The delete confirmation reads `useAnalysisStore` to warn when the
 * persona has already been used in analyses; it owns no persistence itself.
 */
export function PersonaProfilePanel({ persona, onChatClick, onCreateVariant, onDelete, className, ...props }: PersonaProfilePanelProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false)

  const analyses = useAnalysisStore((s) => s.analyses)
  const usedInAnalyses = analyses.filter(
    (s) => s.personaNames?.includes(persona.name),
  )

  const handleDelete = () => {
    onDelete?.(persona.id)
    setIsDeleteDialogOpen(false)
  }

  return (
    <>
      <MinimalCard className={cn("flex flex-col gap-6 h-full relative group", className)} hoverable {...props}>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
            className={DESTRUCTIVE_CARD_CONTROL_CLASS}
            aria-label="Delete persona"
          >
            <XIcon className="size-3.5" />
          </button>
        )}

        <div className="flex items-start gap-5">
          <PersonaAvatar
            name={persona.name}
            size="lg"
          />
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold tracking-tight break-words">{persona.name}</h3>
            </div>
            {/* The role is the card's second identity line: it wraps and
                balances rather than truncating, so a long title never loses its
                last words to an orphan. */}
            <p className="micro-label text-muted-foreground break-words text-balance">{persona.occupation}</p>
            {persona.variantOf && (
              <div className="flex items-center gap-1.5 mt-1">
                <GitForkIcon className="w-3 h-3 text-muted-foreground/80 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground/80 break-words">
                  Variant of {persona.variantOf.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {(persona.goals?.length || persona.decisionStyle) && (
          <div className="flex flex-col gap-6">
            <div className="h-px w-full bg-border/40" />

            {persona.goals?.length ? (
              <div className="flex flex-col gap-2">
                <span className="micro-label text-muted-foreground">
                  Goals
                </span>
                <ul className="flex flex-col gap-3">
                  {persona.goals.slice(0, 3).map((goal, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-base leading-snug text-foreground/85">
                      <span className="mt-2 size-1 rounded-full bg-primary/70 shrink-0" aria-hidden="true" />
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {persona.decisionStyle ? (
              <div className="flex flex-col gap-2">
                <span className="micro-label text-muted-foreground">
                  How they decide
                </span>
                <p className="text-base leading-relaxed text-foreground/85 line-clamp-3">
                  {persona.decisionStyle}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-3">
          {onCreateVariant && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCreateVariant()
              }}
              className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              Create Variant
            </button>
          )}
          {onChatClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChatClick()
              }}
              className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 ring-1 ring-primary/20 focus-visible:outline-none"
            >
              Chat with {persona.name.split(' ')[0]}
            </button>
          )}
        </div>
      </MinimalCard>

      <ConfirmDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={`Delete ${persona.name.split(' ')[0]}?`}
        description={
          usedInAnalyses.length > 0 ? (
            <>
              This action cannot be undone.{' '}
              <span className="text-warning-foreground">
                {persona.name} is used in {pluralize(usedInAnalyses.length, 'analysis', 'analyses')}.
              </span>{' '}
              The persona will be removed but analysis data will be preserved; opening it from an
              analysis will show a "persona deleted" notice.
            </>
          ) : (
            'This persona will be permanently deleted from this batch.'
          )
        }
        confirmLabel="Delete Persona"
        onConfirm={handleDelete}
      />
    </>
  )
}
