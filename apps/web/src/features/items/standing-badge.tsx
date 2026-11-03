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

// The pill's tint repeats what the icon and the word say: ready, taken, needing attention, or gone.
const TONES: Readonly<Record<ItemStanding, string>> = {
  available: 'bg-success/12 text-success',
  booked: 'bg-primary/10 text-primary',
  out: 'bg-foreground/7 text-foreground',
  overdue: 'bg-warning/14 text-warning',
  checking: 'bg-primary/10 text-primary',
  in_repair: 'bg-warning/14 text-warning',
  retired: 'bg-muted text-muted-foreground',
}

// Where an item is, as an icon and a word on a tinted pill, so the meaning never rests on colour alone.
export function StandingBadge({ standing }: { standing: ItemStanding }) {
  const t = useTranslations('shop.items.standing')
  const Icon = ICONS[standing]
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] leading-none font-semibold whitespace-nowrap', TONES[standing])}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {t(standing)}
    </span>
  )
}
