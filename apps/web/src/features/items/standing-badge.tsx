import type { ItemStanding } from '@hold/domain'
import { cn } from 'cn'
import { Archive, ArrowUpRight, CalendarClock, CircleCheck, ScanSearch, TriangleAlert, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

const ICONS: Readonly<Record<ItemStanding, LucideIcon>> = {
  available: CircleCheck,
  booked: CalendarClock,
  out: ArrowUpRight,
  overdue: TriangleAlert,
  checking: ScanSearch,
  in_repair: Wrench,
  retired: Archive,
}

// Where an item is, as an icon and a word, so the meaning never rests on colour alone.
export function StandingBadge({ standing }: { standing: ItemStanding }) {
  const t = useTranslations('shop.items.standing')
  const Icon = ICONS[standing]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', standing === 'overdue' && 'text-warning', standing === 'retired' && 'text-muted-foreground')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {t(standing)}
    </span>
  )
}
