import { cn } from 'cn'
import type { ReactNode } from 'react'

// A soft, rounded ground for illustrations such as phones, with a grid of dots that fades out towards its edges.
// `className` sets the layout inside it.
export function Stage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('relative isolate overflow-clip rounded-3xl border border-border/70 bg-muted/40', className)}>
      <div aria-hidden="true" className="dot-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      {children}
    </div>
  )
}
