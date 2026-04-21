import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground bg-transparent border-0 border-b-2 border-foreground/20 rounded-none px-0 py-2 text-base shadow-none transition-colors duration-400 ease-in-out outline-none focus:border-foreground/50 focus:ring-0",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }