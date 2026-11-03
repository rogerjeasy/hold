import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Every size is at least 44 pixels tall, the touch target AGENTS.md section 9 requires. A label longer than its row
// wraps inside the button instead of pushing the page sideways; a short one stays on one line.
const buttonVariants = cva(
  "inline-flex max-w-full min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent py-2 text-center text-[0.9375rem] leading-snug font-semibold tracking-[-0.005em] transition-[background-color,box-shadow,transform,color,border-color] duration-200 ease-swift select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:bg-primary/92 hover:shadow-[var(--shadow-glow),0_10px_28px_-10px_var(--primary)]",
        contrast: "bg-contrast text-contrast-foreground shadow-xs hover:bg-contrast/88 hover:shadow-raised",
        outline: "border-border bg-card text-foreground shadow-xs hover:border-border-strong hover:bg-card hover:shadow-card",
        ghost: "font-medium text-muted-foreground hover:bg-foreground/6 hover:text-foreground",
        soft: "bg-primary/10 text-primary hover:bg-primary/16",
        destructive: "bg-destructive text-background shadow-xs hover:bg-destructive/90",
      },
      size: {
        default: "min-h-11 px-4.5",
        icon: "size-11 [&_svg:not([class*='size-'])]:size-4.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
