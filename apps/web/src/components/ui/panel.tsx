import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useId } from 'react'

// One block of the Today page: a titled region on a card.
export function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('min-w-0 border bg-card text-card-foreground', className)}>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-3 md:px-5">
        <h2 id={titleId} className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
