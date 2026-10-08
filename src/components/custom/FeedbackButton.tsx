'use client'

import * as React from 'react'
import { MessageSquareIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FEEDBACK_SURVEY_URL, isReportable, submitFeedback } from '@/lib/feedback'
import type { FeedbackContext } from '@/lib/feedback'

interface FeedbackButtonProps {
  /** Trigger text. Error screens say "Report this error". */
  label?: string
  /** Pre-fills the message box, used by the error screens so the error text is already there to edit. */
  defaultMessage?: string
  /** Facts attached to the report. An `error` here also marks the report as an error report. */
  context?: FeedbackContext
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  /**
   * Replaces the default trigger button. The primary nav passes its own item
   * markup so the entry matches the neighbouring destinations exactly.
   */
  trigger?: React.ReactElement
}

/**
 * Opens a small dialog so the user can report a problem from wherever they are.
 * The dialog collects only what the user can add (their words and an optional
 * reply address); routing and diagnostics are attached by the feedback module,
 * which is also where the report is sent. Submitting closes the dialog whether
 * or not the transport could open, since the module never surfaces a failure.
 */
export function FeedbackButton({
  label = 'Feedback',
  defaultMessage = '',
  context,
  variant,
  size,
  className,
  trigger,
}: FeedbackButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [message, setMessage] = React.useState(defaultMessage)
  const [email, setEmail] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const messageId = React.useId()
  const emailId = React.useId()

  // The module's own predicate: Send is never available for a report the
  // module would silently drop, and the dialog closes only when one was sent.
  const hasSomethingToReport = isReportable({
    kind: context?.error ? 'error' : 'general',
    message,
    context,
  })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!hasSomethingToReport) return

    setSending(true)
    await submitFeedback({
      kind: context?.error ? 'error' : 'general',
      message: message.trim(),
      email: email.trim() || undefined,
      context,
    })
    setSending(false)
    setEmail('')
    setMessage(defaultMessage)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant={variant} size={size} className={className}>
            <MessageSquareIcon />
            {label}
          </Button>
        )}
      </DialogTrigger>
      {/*
        The close button is laid out in the header row rather than left to the
        primitive's absolutely positioned one. That one sits at `right-8 top-8`
        inside `p-6`, so any description that wraps onto a second line runs
        underneath it.
      */}
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Tell us what went wrong or what could be better. Your report goes straight to the team.{' '}
              <a
                href={FEEDBACK_SURVEY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
              >
                Want to say more? Take the survey.
              </a>
            </DialogDescription>
          </div>
          <DialogClose className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/30 text-muted-foreground transition-colors duration-200 hover:text-foreground focus:outline-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={messageId} className="text-sm font-medium text-foreground">
              What happened?
            </label>
            <Textarea
              id={messageId}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the problem or the idea"
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="text-sm font-medium text-foreground">
              Email <span className="text-muted-foreground font-normal">(optional, if you want a reply)</span>
            </label>
            <Input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!hasSomethingToReport || sending}>
              {sending ? 'Sending...' : 'Send report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
