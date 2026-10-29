import type { RentalState } from '@hold/domain'
import { cn } from 'cn'
import { ArrowDownLeft, ArrowUpRight, CircleCheck, Clock, Hourglass, MapPin, ScanSearch, TriangleAlert, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

const ICONS: Readonly<Record<RentalState, LucideIcon>> = {
  pending_payment: Hourglass,
  booked: CircleCheck,
  awaiting_hold: Clock,
  ready: CircleCheck,
  out: ArrowUpRight,
  overdue: TriangleAlert,
  dropped_off: MapPin,
  returned: ArrowDownLeft,
  inspecting: ScanSearch,
  settling: ScanSearch,
  closed: CircleCheck,
  cancelled: XCircle,
  abandoned: XCircle,
}

// Where a rental stands, as an icon and words. An unpaid booking past its time says so.
export function RentalStateBadge({ state, lapsed }: { state: RentalState; lapsed: boolean }) {
  const t = useTranslations('rentalStates')
  const Icon = lapsed ? XCircle : ICONS[state]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', (state === 'overdue' || state === 'pending_payment') && !lapsed && 'text-warning', (lapsed || state === 'abandoned' || state === 'cancelled') && 'text-muted-foreground')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {lapsed ? t('lapsed') : t(state)}
    </span>
  )
}
