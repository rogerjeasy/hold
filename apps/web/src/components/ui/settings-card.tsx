import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId } from 'react'

// One setting of the shop, as a card: what it is, a sentence on what it changes, and its form or its current value.
// The card is a region named by its title.
export function SettingsCard({ title, lead, icon: Icon, children }: { title: string; lead: string; icon: LucideIcon; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="surface min-w-0 overflow-clip">
      <div className="flex items-start gap-3.5 border-b border-border/70 px-4 py-4 md:px-5 md:py-5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-[1.1875rem] leading-tight font-extrabold tracking-tight wrap-long-words">{title}</h2>
          <p className="mt-1.5 max-w-prose text-[0.9375rem] text-pretty text-muted-foreground">{lead}</p>
        </div>
      </div>
      <div className="min-w-0 p-4 md:p-5">{children}</div>
    </section>
  )
}
