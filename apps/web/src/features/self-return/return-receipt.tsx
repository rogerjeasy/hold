import { DROP_POINT_VIEW } from '@hold/domain'
import type { HoldState, RentalState } from '@hold/domain'
import { CircleAlert, CircleCheck, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from 'cn'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import { Link } from '@/i18n/navigation'
import { linkRoutes } from '@/lib/routes'
import type { PayPalReading } from '@/server/self-return-page'
import type { ReturnItem } from './return-capture'
import type { ReturnPromise } from './return-intro'
import { ReturnSteps } from './return-steps'

export type ReceiptData = {
  readonly droppedOffAt: Date
  readonly onTime: boolean
  readonly missingAt: Date | null
  readonly rentalState: RentalState
  readonly hold: { readonly reservedCents: number; readonly state: HoldState } | null
  readonly paypal: PayPalReading | null
  readonly simulated: boolean
  readonly items: readonly ReturnItem[]
}

// What PayPal says of the hold now, in the renter's words.
const STANDING = { pending: 'reserved', created: 'reserved', denied: 'reserved', partially_captured: 'charged', captured: 'charged', voided: 'released', expired: 'released' } as const

function HoldNow({ data, promise }: { data: ReceiptData; promise: ReturnPromise }) {
  const t = useTranslations('selfReturn.renter.receipt')
  const format = useShopFormat({ timeZone: promise.timeZone, currency: promise.currency })
  const amount = data.paypal?.amountCents ?? data.hold?.reservedCents
  if (amount === undefined) return null
  const standing = data.paypal === null ? 'reserved' : STANDING[data.paypal.status]
  const source = data.simulated ? t('sample') : data.paypal === null ? t('fromRecord') : t('checkedPayPal', { time: format.time(data.paypal.checkedAt) })
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border bg-card px-4 py-4 md:px-5">
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold">{t(standing)}</p>
        <p className="text-sm text-muted-foreground">{source}</p>
      </div>
      <p className="text-figure">{format.money(amount)}</p>
    </div>
  )
}

// After sending: when it came back, what PayPal holds now, what happens next, and the sealed photographs.
export function ReturnReceipt({ token, data, promise }: { token: string; data: ReceiptData; promise: ReturnPromise }) {
  const t = useTranslations('selfReturn.renter.receipt')
  const format = useShopFormat({ timeZone: promise.timeZone, currency: promise.currency })
  // In the order they were asked for, ending with where the item was left.
  const photos = data.items.flatMap((item) => item.views.flatMap((view) => item.photos.filter((photo) => photo.view === view.key).map((photo) => ({ ...photo, label: view.key === DROP_POINT_VIEW ? t('dropPointPhoto') : view.label }))))
  return (
    <div className="grid gap-6">
      <div className="grid justify-items-start gap-3">
        <p className={cn('label inline-flex items-center gap-1.5 border px-2 py-1 text-xs', data.onTime ? 'border-success text-success' : 'border-border-strong text-muted-foreground')}>
          {data.onTime ? <CircleCheck aria-hidden="true" className="size-3.5" /> : <Clock aria-hidden="true" className="size-3.5" />}
          {data.onTime ? t('onTime') : t('late')}
        </p>
        <div>
          <p className="label text-xs text-muted-foreground">{t('received')}</p>
          <p className="text-headline" data-testid="received-at">{format.time(data.droppedOffAt)}</p>
          <p className="mt-1 text-muted-foreground">{t('where', { date: format.date(data.droppedOffAt) })}</p>
        </div>
      </div>
      {data.missingAt === null ? null : (
        <div role="alert" className="flex gap-3 border border-destructive bg-card p-4 md:p-5">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">{t('missingTitle', { shop: promise.shopName })}</p>
            <p className="mt-1 text-muted-foreground">{t('missingBody', { when: format.when(data.missingAt), time: format.time(data.droppedOffAt) })}</p>
          </div>
        </div>
      )}
      <HoldNow data={data} promise={promise} />
      <ReturnSteps token={token} data={data} promise={promise} count={photos.length} />
      <Panel title={t('photos')} aside={<Link href={linkRoutes.record(token)} referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">{t('record')}</Link>}>
        <div className="grid gap-3 px-4 py-4 md:px-5">
          <p className="text-sm text-muted-foreground">{t('photosBody')}</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((photo) => (
              <li key={photo.view} className="grid min-w-0 gap-1">
                {photo.url === null ? <span className="aspect-thumbnail bg-muted" aria-hidden="true" /> : <img src={photo.url} alt={photo.label} className="aspect-thumbnail w-full object-cover" />}
                <span className="text-[0.8125rem] text-muted-foreground wrap-long-words">{photo.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  )
}
