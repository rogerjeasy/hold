import type { RenterView } from '@hold/db'
import { money } from '@hold/domain'
import { CircleCheck, Hourglass, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { TermsView } from '@/components/booking/terms-view'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import { formatMoney } from '@/lib/money'
import { PayButton } from './pay-button'
import { TwoAmounts } from './two-amounts'

function Status({ view }: { view: RenterView }) {
  const t = useTranslations('renter.status')
  const states = useTranslations('rentalStates')
  // A booking past its time to pay may still be paid while nobody else has its items, so it still asks for payment.
  if (view.state === 'pending_payment') return <StatusLine icon={Hourglass} text={t('pending_payment')} />
  if (view.state === 'abandoned' || view.state === 'cancelled') return <StatusLine icon={XCircle} text={t('abandoned')} />
  if (view.state === 'booked' || view.state === 'awaiting_hold') {
    return (
      <div className="grid gap-1">
        <StatusLine icon={CircleCheck} text={t('booked')} />
        <p className="text-muted-foreground">{t('next')}</p>
      </div>
    )
  }
  return <StatusLine icon={CircleCheck} text={t('other', { state: states(view.state) })} />
}

function StatusLine({ icon: Icon, text }: { icon: typeof Hourglass; text: string }) {
  return (
    <p className="flex items-center gap-2 text-lg font-semibold">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
      {text}
    </p>
  )
}

// The renter's own rental, opened from their link: where it stands, what they rent, the two amounts, the terms, and
// the payment while it is due.
export function RenterScreen({ token, view }: { token: string; view: RenterView }) {
  const t = useTranslations('renter')
  const format = useShopFormat({ timeZone: view.timeZone, currency: view.currency })
  const locale = useLocale()
  const due = view.state === 'pending_payment'
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label flex items-center gap-2 text-xs text-muted-foreground">
          {view.shopName}
          {view.simulated ? <SampleTag /> : null}
        </p>
        <h1 className="text-page-title text-balance wrap-long-words">{t('title', { shop: view.shopName })}</h1>
        <Status view={view} />
      </header>
      <Panel title={t('what')}>
        <ul>
          {view.lines.map((line) => (
            <li key={`${line.name}-${String(line.dayRateCents)}`} className="grid gap-0.5 border-b px-4 py-3 last:border-b-0 md:px-5">
              <span className="font-semibold wrap-long-words">{t('line', { count: line.count, name: line.name })}</span>
              <span className="text-sm text-muted-foreground">
                {t('lineTerms', { rate: formatMoney(money(line.dayRateCents, view.currency), locale), hold: formatMoney(money(line.holdCents, view.currency), locale) })}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t px-4 py-3 text-sm md:px-5">
          {t('period', { start: `${format.day(view.startsAt)}, ${format.time(view.startsAt)}`, end: `${format.day(view.endsAt)}, ${format.time(view.endsAt)}` })}
        </p>
      </Panel>
      <TwoAmounts view={view} />
      <TermsView currency={view.currency} prices={view.prices} wearPolicy={view.wearPolicy} />
      {due ? <PayButton token={token} amount={formatMoney(money(view.feeCents, view.currency), locale)} /> : null}
    </div>
  )
}
