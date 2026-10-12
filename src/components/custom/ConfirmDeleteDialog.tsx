"use client"

import * as React from "react"
import { AlertTriangleIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Sentence(s) naming what is lost. Rendered inside the dialog's paragraph. */
  description: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  /** The delete is in flight: both actions are locked until it settles. */
  pending?: boolean
}

/**
 * The one confirmation step in front of a destructive action.
 *
 * Deleting a batch, a persona or an analysis used to happen on click, with no
 * way back and no statement of what would be lost. Every delete now goes
 * through this dialog so the wording, the destructive action's tier and the
 * pending state are decided once instead of per call site.
 *
 * `description` stays inline (text, `<span>`, `<strong>`): it is rendered
 * inside a `<p>`, so block-level children would break the markup.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next) }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-full bg-destructive/10 shrink-0">
              <AlertTriangleIcon className="size-5 text-destructive" />
            </div>
            <div className="flex flex-col gap-1.5 text-left">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none"
          >
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
