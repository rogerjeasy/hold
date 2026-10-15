import type { RenterView } from '@hold/db'
import { money } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { formatMoney } from '@/lib/money'

// The fee and the hold, never added together: one is paid, the other only reserved (project-description.md section 6.2).
export function TwoAmounts({ view }: { view: RenterView }) {
  const t = useTranslations('renter')
  const locale = useLocale()
  const paid = view.state !== 'pending_payment' && view.state !== 'abandoned'
  return (
    <Panel title={t('twoAmounts')}>
      <dl className="grid gap-px sm:grid-cols-2">
        <div className="min-w-0 px-4 py-4 md:px-5">
          <dt className="text-sm text-muted-foreground">{t('fee')}</dt>
          <dd className="mt-1 text-figure">{formatMoney(money(view.feeCents, view.currency), locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-muted-foreground">{paid ? t('feePaid') : t('feeNow')}</dd>
        </div>
        <div className="min-w-0 px-4 py-4 sm:border-l md:px-5">
          <dt className="text-sm text-muted-foreground">{t('hold')}</dt>
          <dd className="mt-1 text-figure">{formatMoney(money(view.holdCents, view.currency), locale)}</dd>
          <dd className="mt-1 text-[0.8125rem] text-muted-foreground">{t('holdBody')}</dd>
        </div>
      </dl>
      <p className="border-t px-4 py-3 text-sm md:px-5">{t('holdRules', { hours: view.replyPeriodHours })}</p>
    </Panel>
  )
}
