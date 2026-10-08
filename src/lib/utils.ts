import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Joins class names, letting later Tailwind utilities win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Round destructive control pinned to a card's top-right corner.
 *
 * Hidden until the card is hovered, but keyboard users must still see the
 * control they have focused — so reveal it and draw a ring on `:focus-visible`
 * (WCAG 2.4.7). Shared by the persona, batch, and analysis cards.
 */
export const DESTRUCTIVE_CARD_CONTROL_CLASS =
  "absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 hover:bg-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card z-10"
