import type { RentalHold, RenterView } from '@hold/db'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import { HoldReason } from '@/features/trust/hold-reason'
import { HoldButton } from './hold-button'
import { WalkInButton } from './walk-in-button'
import type { PayPalCheckout } from './paypal-sdk'

type HoldScreenProps = {
  token: string
  view: Pick<RenterView, 'shopName' | 'timeZone' | 'currency' | 'holdCents' | 'replyPeriodHours' | 'feeCents' | 'state'>
  // Absent until staff ask for the hold at pickup.
  hold: RentalHold | undefined
  // The shop's PayPal app, for PayPal's own button. Absent where it is not known.
  checkout?: PayPalCheckout | undefined
}

// Where the renter approves the hold at pickup, from the code staff show. It says what the hold is, that it is not a
// charge, and sends them to PayPal for exactly the amount agreed at booking.
export function HoldScreen({ token, view, hold, checkout }: HoldScreenProps) {
  const t = useTranslations('renter.holdPage')
  const walkIn = useTranslations('renter.walkIn')
  const format = useShopFormat({ timeZone: view.timeZone, currency: view.currency })
  const amount = format.money(hold?.reservedCents ?? view.holdCents)
  // A placed hold with an order waiting is being replaced before it ends.
  const replacing = hold !== undefined && hold.state !== 'requested' && hold.orderId !== null
  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 px-4 py-12 md:px-8">
      <p className="label text-xs text-muted-foreground wrap-long-words">{view.shopName}</p>
      <h1 className="text-page-title text-balance">{replacing ? t('replaceTitle') : t('title')}</h1>
      {hold === undefined ? (
        <p className="text-lg">{t('notYet')}</p>
      ) : hold.state === 'requested' || replacing ? (
        <div className="grid gap-5">
          <p className="max-w-prose text-lg text-pretty">{replacing && hold.validUntil !== null ? t('replaceLead', { amount, date: format.day(hold.validUntil) }) : t('lead', { amount })}</p>
          <HoldReason hold={hold} money={format.money} audience="renter" />
          {hold.placementFailure === null ? null : (
            <p role="alert" className="flex gap-1.5 text-[0.9375rem] text-destructive">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4.5 shrink-0" />
              {t('declined')}
            </p>
          )}
          {hold.strategy === 'combined' && hold.state === 'requested' ? <WalkInButton token={token} fee={format.money(view.feeCents)} hold={amount} checkout={checkout} /> : <HoldButton token={token} amount={amount} checkout={checkout} />}
        </div>
      ) : (
        <div className="grid gap-3">
          <p role="status" className="flex items-start gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            {/* A walk-in's fee is captured from the hold just placed, so the page waits for it before saying it is paid. */}
            {hold.strategy !== 'combined' ? t('placed', { amount }) : view.state === 'pending_payment' ? walkIn('taking', { hold: amount, fee: format.money(view.feeCents) }) : walkIn('placed', { hold: amount, fee: format.money(view.feeCents) })}
          </p>
          <HoldReason hold={hold} money={format.money} audience="renter" />
          {hold.validUntil === null ? null : <p className="max-w-prose text-muted-foreground">{t('validUntil', { date: format.day(hold.validUntil) })}</p>}
        </div>
      )}
      <Link href={`${linkRoutes.renter}/${token}`} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
        {t('back')}
      </Link>
    </div>
  )
}
