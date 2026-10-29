import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import { PayPalButton } from '@/features/renter/paypal-button'
import type { PayPalCheckout } from '@/features/renter/paypal-sdk'
import type { ExtensionQuoteView } from '@/server/extension-page'
import { payExtension } from './renter-actions'

// The price Hold set for the days chosen, the new end, and PayPal's button. The hold is said, plainly, to stay as it
// is: the days are paid on their own.
export function QuotePanel({ token, quote, timeZone, currency, holdCents, checkout }: { token: string; quote: ExtensionQuoteView; timeZone: string; currency: string; holdCents: number | null; checkout: PayPalCheckout | undefined }) {
  const t = useTranslations('extension.quote')
  const renter = useTranslations('renter')
  const format = useShopFormat({ timeZone, currency })
  const amount = format.money(quote.feeCents)
  return (
    <Panel title={t('title')}>
      <div className="grid gap-4 px-4 py-4 md:px-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">{t('days', { count: quote.extraDays })}</dt>
            <dd className="mt-1 text-figure" data-testid="extension-fee">{amount}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">{t('newEnd')}</dt>
            <dd className="mt-1 text-lg font-semibold wrap-long-words">{`${format.date(quote.endsAt)}, ${format.time(quote.endsAt)}`}</dd>
          </div>
        </dl>
        <p className="text-pretty">{holdCents === null ? t('paidNow') : t('holdUnchanged', { hold: format.money(holdCents) })}</p>
        <PayPalButton token={token} start={payExtension} texts={{ go: t('pay', { amount }), going: renter('paying'), agree: t('agree') }} {...(checkout === undefined ? {} : { checkout })} />
      </div>
    </Panel>
  )
}
