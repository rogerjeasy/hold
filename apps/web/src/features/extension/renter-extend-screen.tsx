import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { SampleTag } from '@/components/ui/sample-tag'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
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
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="grid gap-3">
        <p className="label flex items-center gap-2 text-xs text-muted-foreground wrap-long-words">
          {data.shopName}
          {data.simulated ? <SampleTag /> : null}
        </p>
        <h1 className="text-page-title text-balance wrap-long-words">{t('title')}</h1>
        <Link href={`${linkRoutes.renter}/${token}`} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline underline-offset-4">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('back')}
        </Link>
      </header>
      <div className="grid gap-1 border-l-2 border-primary pl-3">
        <p className="text-sm text-muted-foreground">{t('dueNow')}</p>
        <p className="text-lg font-semibold" data-testid="due-back">{`${format.date(data.endsAt)}, ${format.time(data.endsAt)}`}</p>
        {data.latestEnd === null || !open ? null : <p className="text-sm text-muted-foreground">{t('latest', { when: `${format.date(data.latestEnd)}, ${format.time(data.latestEnd)}`, days: data.maxDays })}</p>}
      </div>
      {data.state !== 'out' ? <Notice title={t('closed.title')} body={t('closed.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays === 0 ? <Notice title={t('off.title')} body={t('off.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays > 0 && !data.canAct ? <p role="note" className="text-muted-foreground">{t('noScope')}</p> : null}
      {open ? <ExtendForm key={data.endsAt.toISOString()} token={token} endsAt={data.endsAt} timeZone={data.timeZone} suggestedEnd={data.suggestedEnd} maxDays={data.maxDays} /> : null}
      {open && data.quote !== null ? <QuotePanel token={token} quote={data.quote} timeZone={data.timeZone} currency={data.currency} holdCents={data.holdCents} checkout={data.checkout} /> : null}
      <ExtensionsList extensions={data.extensions} timeZone={data.timeZone} currency={data.currency} />
    </div>
  )
}
