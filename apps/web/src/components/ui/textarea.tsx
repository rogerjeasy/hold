import * as React from "react"
import { cn } from "cn"

// Styled like Input. 16 pixel text, so a phone does not zoom in on focus.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-32 w-full min-w-0 px-3.5 py-3 placeholder:text-muted-foreground/80 rounded-xl border border-input/80 bg-card text-base text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-border-strong focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
