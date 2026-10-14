import * as React from "react"
import { cn } from "cn"

// The browser's own select, styled like Input, so it works by keyboard and with a phone's own picker.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-card-foreground disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Select }
