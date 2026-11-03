import type { RenterView } from '@hold/db'
import { money } from '@hold/domain'
import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowRight, BadgeCheck, CalendarPlus, CircleCheck, FileText, Hourglass, PackageCheck, TriangleAlert, XCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { TermsView } from '@/components/booking/terms-view'
import { AssistantNotice } from '@/features/assistant/assistant-notice'
import { ContactPanel } from '@/features/contact/contact-panel'
import type { RenterContactView } from '@/features/contact/contact-view'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { formatMoney } from '@/lib/money'
import { linkRoutes } from '@/lib/routes'
import { SelfReturnCard } from '@/features/self-return/self-return-card'
import type { SelfReturnOffer } from '@/features/self-return/self-return-card'
import { EvidenceNotice } from './evidence-notice'
import { PayButton } from './pay-button'
import { RentalJourney } from './rental-journey'
import { RenterHead, RenterPage } from './renter-page'
import { WalkInButton } from './walk-in-button'
import { TwoAmounts } from './two-amounts'
import type { PayPalCheckout } from './paypal-sdk'

type Tone = 'waiting' | 'good' | 'ended'

const TONE: Readonly<Record<Tone, string>> = {
  waiting: 'bg-primary/10 text-primary',
  good: 'bg-success/12 text-success',
  ended: 'bg-muted text-muted-foreground',
}

function StatusLine({ icon: Icon, text, tone = 'good' }: { icon: LucideIcon; text: string; tone?: Tone }) {
  return (
    <p className="flex items-center gap-3 text-xl leading-snug font-extrabold tracking-tight text-balance">
      <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-xl', TONE[tone], tone === 'waiting' && 'animate-pulse-ring')}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 wrap-long-words">{text}</span>
    </p>
  )
}

const quietLink = 'inline-flex min-h-11 items-center gap-1.5 justify-self-start font-semibold text-primary underline-offset-4 hover:underline'

// Where the rental stands, in one sentence, and the one thing to do next when there is one.
function Status({ token, view, pay }: { token: string; view: RenterView; pay: string }) {
  const t = useTranslations('renter.status')
  const renter = useTranslations('renter')
  const states = useTranslations('rentalStates')
  const format = useShopFormat({ timeZone: view.timeZone, currency: view.currency })
  // A booking past its time to pay may still be paid while nobody else has its items, so it still asks for payment.
  if (view.state === 'pending_payment') {
    return (
      <div className="grid justify-items-start gap-3">
        <StatusLine icon={Hourglass} tone="waiting" text={t('pending_payment')} />
        {/* The window is short; saying when it closes keeps it from being a surprise. */}
        {view.paymentKeptUntil === null ? null : <p className="text-muted-foreground">{t('keptUntil', { time: format.time(view.paymentKeptUntil) })}</p>}
        <a href="#pay" className={quietLink}>
          {renter('reviewAndPay', { amount: pay })}
          <ArrowDown aria-hidden="true" className="size-4" />
        </a>
      </div>
    )
  }
  if (view.state === 'abandoned' || view.state === 'cancelled') return <StatusLine icon={XCircle} tone="ended" text={t('abandoned')} />
  if (view.state === 'awaiting_hold') {
    return (
      <div className="grid justify-items-start gap-3">
        <StatusLine icon={CircleCheck} tone="waiting" text={t('awaiting_hold')} />
        <p className="text-muted-foreground">{t('holdNext')}</p>
        <Button asChild className="min-h-12 w-full sm:w-auto">
          <Link href={`${linkRoutes.renter}/${token}/pay`}>
            {t('approveHold')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    )
  }
  if (view.state === 'ready') return <StatusLine icon={BadgeCheck} text={t('ready')} />
  if (view.state === 'out') {
    return (
      <div className="grid justify-items-start gap-2">
        <StatusLine icon={PackageCheck} text={t('out')} />
        <Link href={`${linkRoutes.renter}/${token}/condition`} className={quietLink}>
          {t('condition')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    )
  }
  if (view.state === 'dropped_off') {
    return (
      <div className="grid justify-items-start gap-2">
        <StatusLine icon={CircleCheck} text={t('dropped_off')} />
        <Link href={linkRoutes.selfReturn(token)} referrerPolicy="no-referrer" className={quietLink}>
          {t('returnReceipt')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    )
  }
  if (view.state === 'booked') {
    return (
      <div className="grid gap-2">
        <StatusLine icon={CircleCheck} text={t('booked')} />
        <p className="text-muted-foreground">{t('next')}</p>
      </div>
    )
  }
  return <StatusLine icon={view.state === 'overdue' ? TriangleAlert : CircleCheck} tone={view.state === 'overdue' ? 'waiting' : 'good'} text={t('other', { state: states(view.state) })} />
}

// One row of the list of the renter's records: a link with its icon, read like a row in a wallet's settings.
function RecordRow({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <li>
      <Link href={href} referrerPolicy="no-referrer" className="group flex min-h-14 items-center gap-3 px-4 py-2 font-semibold transition-colors hover:bg-foreground/3 md:px-5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1 wrap-long-words">{children}</span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-swift group-hover:translate-x-0.5" />
      </Link>
    </li>
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
  const fee = formatMoney(money(view.feeCents, view.currency), locale)
  const hold = formatMoney(money(view.holdCents, view.currency), locale)
  const reporting = canReport && ['out', 'overdue'].includes(view.state)
  return (
    <RenterPage>
      <RenterHead shopName={view.shopName} simulated={view.simulated} title={t('title', { shop: view.shopName })} />
      <section aria-label={t('journey.title')} className="surface grid min-w-0 animate-rise gap-5 p-5 md:p-6">
        <Status token={token} view={view} pay={fee} />
        <div className="border-t border-border/70 pt-5">
          <RentalJourney state={view.state} />
        </div>
        {selfReturn.shopClosed ? <SelfReturnCard token={token} offer={selfReturn} /> : null}
        {assistant === null ? null : <AssistantNotice token={token} assistant={assistant} />}
        {canExtend || reporting ? (
          <div className="grid gap-2 border-t border-border/70 pt-5 sm:flex sm:flex-wrap">
            {canExtend ? (
              <Button asChild variant="outline" className="min-h-12">
                <Link href={linkRoutes.extend(token)} referrerPolicy="no-referrer"><CalendarPlus aria-hidden="true" />{t('keepLonger')}</Link>
              </Button>
            ) : null}
            {reporting ? (
              <Button asChild variant="outline" className="min-h-12">
                <Link href={linkRoutes.incidents(token)} referrerPolicy="no-referrer"><TriangleAlert aria-hidden="true" />{t('somethingHappened')}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {selfReturn.shopClosed ? null : <SelfReturnCard token={token} offer={selfReturn} />}
      </section>
      {contact === undefined || ['closed', 'cancelled', 'abandoned'].includes(view.state) || view.simulated ? null : <ContactPanel token={token} contact={contact} />}
      <TwoAmounts view={view} />
      <Panel title={t('what')}>
        <ul className="divide-y divide-border/70">
          {view.lines.map((line) => (
            <li key={`${line.name}-${String(line.dayRateCents)}`} className="grid gap-0.5 px-4 py-3.5 md:px-5">
              <span className="font-semibold wrap-long-words">{t('line', { count: line.count, name: line.name })}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t('lineTerms', { rate: formatMoney(money(line.dayRateCents, view.currency), locale), hold: formatMoney(money(line.holdCents, view.currency), locale) })}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 border-t border-border/70 bg-muted/40 px-4 py-3 text-sm md:px-5">
          <CalendarPlus aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 wrap-long-words">{t('period', { start: `${format.day(view.startsAt)}, ${format.time(view.startsAt)}`, end: `${format.day(view.endsAt)}, ${format.time(view.endsAt)}` })}</span>
        </p>
      </Panel>
      <TermsView currency={view.currency} prices={view.prices} wearPolicy={view.wearPolicy} />
      {due ? (
        <section id="pay" aria-label={t('payTitle')} className="surface grid min-w-0 scroll-mt-20 gap-4 p-5 ring-1 ring-primary/25 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[1.0625rem] leading-tight font-extrabold tracking-tight">{t('payTitle')}</h2>
            {view.walkIn ? null : <p className="figures text-sm text-muted-foreground">{fee}</p>}
          </div>
          <EvidenceNotice />
          {view.walkIn ? <WalkInButton token={token} fee={fee} hold={hold} checkout={checkout} /> : <PayButton token={token} amount={fee} checkout={checkout} />}
        </section>
      ) : null}
      <section aria-label={t('records')} className="grid gap-3">
        {/* Asked once, in a sentence, at the first booking (extensions.md section 7.6). The answer needs the renter's code. */}
        {askConsent ? <p className="max-w-prose border-l-2 border-primary pl-3 text-pretty">{trust('consentQuestion')}</p> : null}
        <ul className="surface divide-y divide-border/70 overflow-clip">
          <RecordRow href={linkRoutes.record(token)} icon={FileText}>{records('title')}</RecordRow>
          <RecordRow href={linkRoutes.cleanRecord(token)} icon={BadgeCheck}>{trust('link')}</RecordRow>
        </ul>
      </section>
    </RenterPage>
  )
}
