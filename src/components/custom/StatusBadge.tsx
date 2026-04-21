import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-400 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-ink/10 text-ink hover:bg-ink/20",
        secondary:
          "border-transparent bg-[rgba(26,26,27,0.06)] text-foreground/80 hover:bg-[rgba(26,26,27,0.1)]",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline: "text-foreground border border-[rgba(26,26,27,0.15)] bg-transparent",
        success: "border-transparent bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20",
        warning: "border-transparent bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function StatusBadge({ className, variant, ...props }: StatusBadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}