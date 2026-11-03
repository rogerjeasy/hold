import type { RentalState } from '@hold/domain'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/ui/status-pill'
import type { StatusTone } from '@/components/ui/status-pill'

// Each state's tone: waiting on someone, moving along, needing a person, done, or stopped.
const TONES: Readonly<Record<RentalState, StatusTone>> = {
  pending_payment: 'attention',
  booked: 'progress',
  awaiting_hold: 'attention',
  ready: 'progress',
  out: 'progress',
  overdue: 'danger',
  dropped_off: 'attention',
  returned: 'attention',
  inspecting: 'attention',
  settling: 'progress',
  closed: 'success',
  cancelled: 'neutral',
  abandoned: 'neutral',
}

// Someone is waiting on these right now, so the dot pulses.
const LIVE: ReadonlySet<RentalState> = new Set(['awaiting_hold', 'overdue', 'dropped_off'])

// Where a rental stands, in words on a tinted pill. An unpaid booking past its time says so.
export function RentalStateBadge({ state, lapsed, className }: { state: RentalState; lapsed: boolean; className?: string }) {
  const t = useTranslations('rentalStates')
  return (
    <StatusPill tone={lapsed ? 'neutral' : TONES[state]} live={!lapsed && LIVE.has(state)} className={className}>
      {lapsed ? t('lapsed') : t(state)}
    </StatusPill>
  )
}
