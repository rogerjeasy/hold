import { CalendarClock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { BackLink, RenterHead, RenterPage } from '@/features/renter/renter-page'
import { useShopFormat } from '@/hooks/use-shop-format'
import { linkRoutes } from '@/lib/routes'
import type { ExtensionData } from '@/server/extension-page'
import { ExtendForm } from './extend-form'
import { ExtensionsList } from './extensions-list'
import { QuotePanel } from './quote-panel'

// Keeping the item longer from the renter's own phone (architecture.md section 6.14): when it is due back now, a new end
// in a tap, Hold's price for it, and PayPal. It goes through once paid, with nobody at the shop to ask.
export function RenterExtendScreen({ token, data }: { token: string; data: ExtensionData }) {
  const t = useTranslations('extension')
  const format = useShopFormat({ timeZone: data.timeZone, currency: data.currency })
  const open = data.state === 'out' && data.maxDays > 0 && data.canAct
  return (
    <RenterPage>
      <RenterHead shopName={data.shopName} simulated={data.simulated} title={t('title')} />
      <div className="surface flex min-w-0 animate-rise items-start gap-4 p-5 md:p-6">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <CalendarClock className="size-5" />
        </span>
        <div className="grid min-w-0 gap-1">
          <p className="label text-xs text-muted-foreground">{t('dueNow')}</p>
          <p className="text-xl font-extrabold tracking-tight wrap-long-words" data-testid="due-back">{`${format.date(data.endsAt)}, ${format.time(data.endsAt)}`}</p>
          {data.latestEnd === null || !open ? null : <p className="text-sm text-muted-foreground">{t('latest', { when: `${format.date(data.latestEnd)}, ${format.time(data.latestEnd)}`, days: data.maxDays })}</p>}
        </div>
      </div>
      {data.state !== 'out' ? <Notice title={t('closed.title')} body={t('closed.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays === 0 ? <Notice title={t('off.title')} body={t('off.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays > 0 && !data.canAct ? <p role="note" className="text-muted-foreground">{t('noScope')}</p> : null}
      {open ? <ExtendForm key={data.endsAt.toISOString()} token={token} endsAt={data.endsAt} timeZone={data.timeZone} suggestedEnd={data.suggestedEnd} maxDays={data.maxDays} /> : null}
      {open && data.quote !== null ? <QuotePanel token={token} quote={data.quote} timeZone={data.timeZone} currency={data.currency} holdCents={data.holdCents} checkout={data.checkout} /> : null}
      <ExtensionsList extensions={data.extensions} timeZone={data.timeZone} currency={data.currency} />
      <BackLink href={`${linkRoutes.renter}/${token}`}>{t('back')}</BackLink>
    </RenterPage>
  )
}
