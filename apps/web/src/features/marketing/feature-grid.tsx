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

export function FeatureGrid({ items, tone = 'page', columns = 'three' }: FeatureGridProps) {
  return (
    <ul role="list" className={cn('grid gap-x-10', columnClasses[columns])}>
      {items.map(({ title, body, icon: Icon }) => (
        <li key={title} className={cn('border-t pt-4 pb-8', tone === 'band' ? 'border-t-band-foreground' : 'border-t-foreground')}>
          {Icon ? <Icon aria-hidden="true" className={cn('mb-4 size-6', tone === 'band' ? 'text-band-accent' : 'text-primary')} /> : null}
          <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{title}</h3>
          <p className={cn('mt-2', tone === 'band' ? 'text-band-muted' : 'text-muted-foreground')}>{body}</p>
        </li>
      ))}
    </ul>
  )
}
