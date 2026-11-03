import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// What a page or a panel says when it has nothing to show yet: what will appear here, and the first thing to do.
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="relative isolate grid animate-fade justify-items-center gap-3 overflow-hidden px-6 py-12 text-center">
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid mask-radial-from-0% mask-radial-to-70% opacity-70" />
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl border bg-card text-primary shadow-card">
        <Icon className="size-5" />
      </span>
      <p className="mt-1 text-[1.0625rem] font-extrabold tracking-tight">{title}</p>
      <p className="max-w-sm text-muted-foreground">{body}</p>
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  )
}
