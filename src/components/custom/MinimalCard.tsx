import * as React from "react"
import { cn } from "@/lib/utils"

export interface MinimalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export const MinimalCard = React.forwardRef<HTMLDivElement, MinimalCardProps>(
  ({ className, hoverable = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[1.25rem] border border-white/10 bg-card p-6 md:p-8 text-card-foreground shadow-sm transition-colors duration-150",
          hoverable && "hover:border-white/20 cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)
MinimalCard.displayName = "MinimalCard"
