import { cn } from "@/lib/utils"

/** Temporary module used to exercise the steward's PR body generator. */
export function smokeClassName(active: boolean): string {
  return cn("px-2", active && "bg-accent")
}
