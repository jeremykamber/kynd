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
          "rounded-xl border border-[rgba(26,26,27,0.08)] bg-[#F8F7F2] p-6 md:p-8 text-foreground shadow-sm transition-all duration-400 ease-in-out",
          hoverable && "hover:border-[rgba(26,26,27,0.15] cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)
MinimalCard.displayName = "MinimalCard"