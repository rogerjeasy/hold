import * as React from "react"
import { cn } from "cn"

// At least 48 pixels tall and 16 pixel text, so it is easy to tap and a phone does not zoom in on focus.
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-base text-card-foreground placeholder:text-muted-foreground disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
