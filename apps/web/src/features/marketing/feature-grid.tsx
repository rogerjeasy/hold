import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from './section'

export type Feature = {
  title: string
  body: string
  icon?: LucideIcon
}

type FeatureGridProps = {
  items: readonly Feature[]
  tone?: Tone
  // One column suits a grid that sits beside something else.
  columns?: 'one' | 'three' | 'four'
}

const columnClasses = {
  one: '',
  three: 'sm:grid-cols-2 lg:grid-cols-3',
  four: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

// Points side by side as cards. In a single column beside something else they are rows on the page instead, so the
// thing beside them stays the one card.
export function FeatureGrid({ items, tone = 'page', columns = 'three' }: FeatureGridProps) {
  const band = tone === 'band'
  const single = columns === 'one'

  return (
    <ul role="list" className={cn('stagger grid', single ? 'gap-0' : 'gap-4', columnClasses[columns])}>
      {items.map(({ title, body, icon: Icon }) => (
        <li
          key={title}
          className={cn(
            single
              ? cn('border-t py-5 first:border-t-0 first:pt-0', band ? 'border-band-border' : 'border-border/70')
              : band
                ? 'rounded-2xl border border-band-border bg-band-hover p-5 md:p-6'
                : 'surface p-5 md:p-6',
          )}
        >
          {Icon ? (
            <span
              aria-hidden="true"
              className={cn('mb-5 grid size-11 place-items-center rounded-xl', band ? 'bg-band-accent/15 text-band-accent' : 'bg-primary/10 text-primary')}
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{title}</h3>
          <p className={cn('mt-2', band ? 'text-band-muted' : 'text-muted-foreground')}>{body}</p>
        </li>
      ))}
    </ul>
  )
}
