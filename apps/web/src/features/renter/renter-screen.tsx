import type { RenterView } from '@hold/db'
import { money } from '@hold/domain'
import { CalendarPlus, CircleCheck, Hourglass, TriangleAlert, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { TermsView } from '@/components/booking/terms-view'
import { AssistantNotice } from '@/features/assistant/assistant-notice'
import { ContactPanel } from '@/features/contact/contact-panel'
import type { RenterContactView } from '@/features/contact/contact-view'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/money'
import { linkRoutes } from '@/lib/routes'
import { SelfReturnCard } from '@/features/self-return/self-return-card'
import type { SelfReturnOffer } from '@/features/self-return/self-return-card'
import { EvidenceNotice } from './evidence-notice'
import { PayButton } from './pay-button'
import { WalkInButton } from './walk-in-button'
import { TwoAmounts } from './two-amounts'
import type { PayPalCheckout } from './paypal-sdk'

function Status({ token, view }: { token: string; view: RenterView }) {
  const t = useTranslations('renter.status')
  const states = useTranslations('rentalStates')
  // A booking past its time to pay may still be paid while nobody else has its items, so it still asks for payment.
  if (view.state === 'pending_payment') return <StatusLine icon={Hourglass} text={t('pending_payment')} />
  if (view.state === 'abandoned' || view.state === 'cancelled') return <StatusLine icon={XCircle} text={t('abandoned')} />
  if (view.state === 'awaiting_hold') {
    return (
      <div className="grid justify-items-start gap-3">
        <StatusLine icon={CircleCheck} text={t('awaiting_hold')} />
        <p className="text-muted-foreground">{t('holdNext')}</p>
        <Button asChild className="min-h-12">
          <Link href={`${linkRoutes.renter}/${token}/pay`}>{t('approveHold')}</Link>
        </Button>
      </div>
    )
  }
  if (view.state === 'ready') return <StatusLine icon={CircleCheck} text={t('ready')} />
  if (view.state === 'out') {
    return (
      <div className="grid justify-items-start gap-3">
        <StatusLine icon={CircleCheck} text={t('out')} />
        <Link href={`${linkRoutes.renter}/${token}/condition`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t('condition')}
        </Link>
      </div>
    )
  }
  if (view.state === 'dropped_off') {
    return (
      <div className="grid justify-items-start gap-3">
        <StatusLine icon={CircleCheck} text={t('dropped_off')} />
        <Link href={linkRoutes.selfReturn(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t('returnReceipt')}
        </Link>
      </div>
    )
  }
  if (view.state === 'booked') {
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
export function RenterScreen({
  token,
  view,
  canReport = false,
  askConsent = false,
  assistant = null,
  checkout,
  selfReturn = { offered: false, shopClosed: false, droppedOffAt: null },
  canExtend = false,
  contact,
}: {
  token: string
  view: RenterView
  canReport?: boolean
  askConsent?: boolean
  assistant?: { readonly connected: boolean; readonly revoked: boolean } | null
  // The shop's PayPal app, for PayPal's own button. Absent where it is not known.
  checkout?: PayPalCheckout | undefined
  selfReturn?: SelfReturnOffer
  // The renter may keep the item longer from this link (architecture.md section 6.14).
  canExtend?: boolean
  // How the renter is reached, chosen here on their own phone (architecture.md section 12.3).
  contact?: RenterContactView | undefined
}) {
  const t = useTranslations('renter')
  const trust = useTranslations('trust.record')
  const records = useTranslations('records')
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
        <Status token={token} view={view} />
        {selfReturn.shopClosed ? <SelfReturnCard token={token} offer={selfReturn} /> : null}
        {assistant === null ? null : <AssistantNotice token={token} assistant={assistant} />}
        {canExtend ? (
          <Button asChild variant="outline" className="min-h-12 justify-self-start">
            <Link href={linkRoutes.extend(token)} referrerPolicy="no-referrer"><CalendarPlus aria-hidden="true" />{t('keepLonger')}</Link>
          </Button>
        ) : null}
        {canReport && ['out', 'overdue'].includes(view.state) ? (
          <Button asChild variant="outline" className="min-h-12 justify-self-start">
            <Link href={linkRoutes.incidents(token)} referrerPolicy="no-referrer"><TriangleAlert aria-hidden="true" />{t('somethingHappened')}</Link>
          </Button>
        ) : null}
        {selfReturn.shopClosed ? null : <SelfReturnCard token={token} offer={selfReturn} />}
        <Link href={linkRoutes.record(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{records('title')}</Link>
        {/* Asked once, in a sentence, at the first booking (extensions.md section 7.6). The answer needs the renter's code. */}
        {askConsent ? <p className="max-w-prose border-l-2 border-primary pl-3 text-pretty">{trust('consentQuestion')}</p> : null}
        <Link href={linkRoutes.cleanRecord(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">{trust('link')}</Link>
      </header>
      {contact === undefined || ['closed', 'cancelled', 'abandoned'].includes(view.state) || view.simulated ? null : <ContactPanel token={token} contact={contact} />}
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
      {due ? <EvidenceNotice /> : null}
      {due && view.walkIn ? <WalkInButton token={token} fee={formatMoney(money(view.feeCents, view.currency), locale)} hold={formatMoney(money(view.holdCents, view.currency), locale)} checkout={checkout} /> : null}
      {due && !view.walkIn ? <PayButton token={token} amount={formatMoney(money(view.feeCents, view.currency), locale)} checkout={checkout} /> : null}
    </div>
  )
}
