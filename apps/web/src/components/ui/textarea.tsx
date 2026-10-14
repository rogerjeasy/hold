import * as React from "react"
import { cn } from "cn"

// Styled like Input. 16 pixel text, so a phone does not zoom in on focus.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-32 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 py-3 text-base text-card-foreground placeholder:text-muted-foreground disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
