import * as React from "react"
import { cn } from "cn"

// The browser's own select, styled like Input, so it works by keyboard and with a phone's own picker.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "min-h-12 w-full min-w-0 px-3 rounded-xl border border-input/80 bg-card text-base text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-border-strong focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Select }
