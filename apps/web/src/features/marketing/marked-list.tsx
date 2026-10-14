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

// A short list under its own small heading, each line led by the same icon.
export function MarkedList({ title, items, icon: Icon, accent = false, tone = 'page' }: MarkedListProps) {
  const titleId = useId()
  const accentColor = tone === 'band' ? 'text-band-accent' : 'text-primary'

  return (
    <div>
      <h3 id={titleId} className={cn('label border-b pb-3', tone === 'band' ? 'border-band-foreground' : 'border-foreground')}>
        {title}
      </h3>
      <ul aria-labelledby={titleId}>
        {items.map((item) => (
          <li key={item} className={cn('flex gap-3 border-b py-3.5 text-[1.0625rem]', tone === 'band' && 'border-band-border')}>
            <Icon aria-hidden="true" className={cn('mt-1 size-5 shrink-0', accent && accentColor)} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
