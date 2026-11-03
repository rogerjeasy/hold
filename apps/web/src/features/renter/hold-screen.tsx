import type { RentalHold, RenterView } from '@hold/db'
import { CircleAlert, CircleCheck, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import { linkRoutes } from '@/lib/routes'
import { ContactPanel } from '@/features/contact/contact-panel'
import type { RenterContactView } from '@/features/contact/contact-view'
import { HoldReason } from '@/features/trust/hold-reason'
import { EvidenceNotice } from './evidence-notice'
import { HoldButton } from './hold-button'
import { HoldCard } from './hold-card'
import { BackLink, RenterHead, RenterPage } from './renter-page'
import { WalkInButton } from './walk-in-button'
import type { PayPalCheckout } from './paypal-sdk'

type HoldScreenProps = {
  token: string
  view: Pick<RenterView, 'shopName' | 'timeZone' | 'currency' | 'holdCents' | 'replyPeriodHours' | 'feeCents' | 'state'>
  // Absent until staff ask for the hold at pickup.
  hold: RentalHold | undefined
  // The shop's PayPal app, for PayPal's own button. Absent where it is not known.
  checkout?: PayPalCheckout | undefined
  // How the renter is reached: set here, at the counter, before the hold makes the number theirs (section 12.3).
  contact?: RenterContactView | undefined
}

// Where the renter approves the hold at pickup, from the code staff show. It says what the hold is, that it is not a
// charge, and sends them to PayPal for exactly the amount agreed at booking.
export function HoldScreen({ token, view, hold, checkout, contact }: HoldScreenProps) {
  const t = useTranslations('renter.holdPage')
  const walkIn = useTranslations('renter.walkIn')
  const format = useShopFormat({ timeZone: view.timeZone, currency: view.currency })
  const amount = format.money(hold?.reservedCents ?? view.holdCents)
  // A placed hold with an order waiting is being replaced before it ends.
  const replacing = hold !== undefined && hold.state !== 'requested' && hold.orderId !== null
  const asking = hold !== undefined && (hold.state === 'requested' || replacing)
  return (
    <RenterPage className="max-w-xl">
      <RenterHead shopName={view.shopName} title={replacing ? t('replaceTitle') : t('title')} />
      <HoldCard amount={amount} standing={hold === undefined || asking ? 'waiting' : 'reserved'} />
      {hold === undefined ? (
        <p className="flex items-start gap-3 rounded-2xl bg-muted/70 px-4 py-3.5 text-pretty">
          <Clock aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
          {t('notYet')}
        </p>
      ) : asking ? (
        <div className="grid gap-5">
          <p className="max-w-prose text-lg text-pretty">{replacing && hold.validUntil !== null ? t('replaceLead', { amount, date: format.day(hold.validUntil) }) : t('lead', { amount })}</p>
          <HoldReason hold={hold} money={format.money} audience="renter" />
          {contact === undefined || contact.locked ? null : <ContactPanel token={token} contact={contact} />}
          <section aria-label={t('title')} className="surface grid min-w-0 gap-4 p-5 ring-1 ring-primary/25 md:p-6">
            {hold.placementFailure === null ? null : (
              <p role="alert" className="flex gap-2 rounded-xl bg-destructive/8 p-3 text-[0.9375rem] text-destructive">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
                {t('declined')}
              </p>
            )}
            <EvidenceNotice />
            {hold.strategy === 'combined' && hold.state === 'requested' ? <WalkInButton token={token} fee={format.money(view.feeCents)} hold={amount} checkout={checkout} /> : <HoldButton token={token} amount={amount} checkout={checkout} />}
          </section>
        </div>
      ) : (
        <div className="grid gap-4">
          <p role="status" className="surface flex animate-pop items-start gap-3 p-5 text-lg font-semibold text-pretty md:p-6">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-success" />
            {/* A walk-in's fee is captured from the hold just placed, so the page waits for it before saying it is paid. */}
            {hold.strategy !== 'combined' ? t('placed', { amount }) : view.state === 'pending_payment' ? walkIn('taking', { hold: amount, fee: format.money(view.feeCents) }) : walkIn('placed', { hold: amount, fee: format.money(view.feeCents) })}
          </p>
          <HoldReason hold={hold} money={format.money} audience="renter" />
          {hold.validUntil === null ? null : <p className="max-w-prose text-muted-foreground">{t('validUntil', { date: format.day(hold.validUntil) })}</p>}
        </div>
      )}
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('back')}</BackLink>
    </RenterPage>
  )
}
