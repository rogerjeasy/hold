import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId } from 'react'

// A titled region on a card: the building block of every signed-in page. An icon, when given, sits in a soft tile
// beside the title.
export function Panel({ title, aside, icon: Icon, children, className }: { title: string; aside?: ReactNode; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('surface min-w-0 overflow-clip', className)}>
      <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/70 px-4 py-3 md:px-5">
        <h2 id={titleId} className="flex min-w-0 items-center gap-2.5 text-[1.0625rem] leading-tight font-extrabold tracking-tight">
          {Icon === undefined ? null : (
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          )}
          <span className="min-w-0 wrap-long-words">{title}</span>
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
