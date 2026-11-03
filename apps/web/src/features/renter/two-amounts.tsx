import type { RenterView } from '@hold/db'
import type { RentalState } from '@hold/domain'
import { money } from '@hold/domain'
import { CircleCheck, UserCheck } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId } from 'react'
import { formatMoney } from '@/lib/money'
import { HoldCard } from './hold-card'
import type { HoldCardStanding } from './hold-card'

// Where the hold stands for a rental in this state, as far as the renter's own page can say.
const STANDING: Readonly<Record<RentalState, HoldCardStanding>> = {
  pending_payment: 'waiting',
  booked: 'waiting',
  awaiting_hold: 'waiting',
  ready: 'reserved',
  out: 'reserved',
  overdue: 'reserved',
  dropped_off: 'reserved',
  returned: 'reserved',
  inspecting: 'reserved',
  settling: 'settling',
  closed: 'ended',
  cancelled: 'none',
  abandoned: 'none',
}

// The fee and the hold, never added together: one is paid, the other only reserved (project-description.md section 6.2).
// The hold is the dark card of a wallet; the fee a plain receipt beside it.
export function TwoAmounts({ view }: { view: RenterView }) {
  const t = useTranslations('renter')
  const locale = useLocale()
  const titleId = useId()
  const paid = view.state !== 'pending_payment' && view.state !== 'abandoned'
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 gap-4">
      <h2 id={titleId} className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('twoAmounts')}</h2>
      <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <HoldCard amount={formatMoney(money(view.holdCents, view.currency), locale)} standing={STANDING[view.state]}>
          <p className="text-sm text-pretty text-band-muted">{t('holdBody')}</p>
        </HoldCard>
        <div className="surface grid min-w-0 content-start gap-3 p-5 md:p-6">
          <p className="label text-xs text-muted-foreground">{t('fee')}</p>
          <p className="text-figure tabular-nums wrap-long-words">{formatMoney(money(view.feeCents, view.currency), locale)}</p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            {paid ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" /> : null}
            <span className="min-w-0">{paid ? t('feePaid') : t('feeNow')}</span>
          </p>
        </div>
      </div>
      <p className="flex items-start gap-3 rounded-2xl bg-muted/70 px-4 py-3.5 text-sm text-pretty md:px-5">
        <UserCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
        <span className="min-w-0">{t('holdRules', { hours: view.replyPeriodHours })}</span>
      </p>
    </section>
  )
}
