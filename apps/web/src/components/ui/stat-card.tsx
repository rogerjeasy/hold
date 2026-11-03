import type { LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { StatusPill } from '@/components/ui/status-pill'

type StatCardProps = {
  readonly icon: LucideIcon
  readonly label: string
  readonly value: string
  readonly note?: string | undefined
  // Words for a number that waits on a person, such as "Needs you": the card wears the accent and the words pulse.
  readonly urgent?: string | undefined
  readonly testId?: string | undefined
  readonly className?: string | undefined
}

// One number on its own card, in a <dl> laid out by its caller: what it counts, the number, and a line about it. The
// term holds the icon and any words of urgency, so the list keeps each term beside its details.
export function StatCard({ icon: Icon, label, value, note, urgent, testId, className }: StatCardProps) {
  return (
    <div className={cn('surface relative grid min-w-0 content-start gap-1 overflow-clip p-4 md:p-5', urgent !== undefined && 'border-primary/45 shadow-raised', className)}>
      {urgent === undefined ? null : <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
      <dt className="grid min-w-0 gap-3">
        <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-xl', urgent === undefined ? 'bg-muted text-foreground/75' : 'bg-primary/10 text-primary')}>
            <Icon className="size-[1.125rem]" />
          </span>
          {urgent === undefined ? null : <StatusPill tone="progress" live>{urgent}</StatusPill>}
        </span>
        <span className="text-sm font-medium text-muted-foreground wrap-long-words">{label}</span>
      </dt>
      <dd className="mt-0.5 text-figure tabular-nums wrap-long-words" data-testid={testId}>
        {/* The colour sits on its own element: merged with the size, cn would keep only one of them. */}
        <span className={cn(urgent !== undefined && 'text-primary')}>{value}</span>
      </dd>
      {note === undefined ? null : <dd className="text-[0.8125rem] text-muted-foreground wrap-long-words">{note}</dd>}
    </div>
  )
}
