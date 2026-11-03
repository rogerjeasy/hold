import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { Tone } from './section'

type MarkedListProps = {
  title: string
  items: readonly string[]
  icon: LucideIcon
  // The accent colour marks the list a reader should not miss.
  accent?: boolean
  tone?: Tone
}

// A short list on its own card under a small heading, each line led by the same icon.
export function MarkedList({ title, items, icon: Icon, accent = false, tone = 'page' }: MarkedListProps) {
  const titleId = useId()
  const band = tone === 'band'
  const accentColor = band ? 'text-band-accent' : 'text-primary'

  return (
    <div
      className={cn(
        'h-full rounded-2xl border p-5 md:p-7',
        band ? 'border-band-border bg-band-hover' : 'surface',
        accent && (band ? 'border-t-2 border-t-band-accent' : 'border-t-2 border-t-primary'),
      )}
    >
      <h3 id={titleId} className={cn('label text-xs', accent ? accentColor : band ? 'text-band-muted' : 'text-muted-foreground')}>
        {title}
      </h3>
      <ul aria-labelledby={titleId} className="mt-4 grid">
        {items.map((item) => (
          <li key={item} className={cn('flex gap-3 border-t py-3.5 text-[1.0625rem] first:border-t-0 first:pt-1', band ? 'border-band-border' : 'border-border/70')}>
            <Icon aria-hidden="true" className={cn('mt-1 size-5 shrink-0', accent ? accentColor : band ? 'text-band-success' : 'text-success')} />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
