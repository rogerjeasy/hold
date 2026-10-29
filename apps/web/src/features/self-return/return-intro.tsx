import type { ShopOpening } from '@hold/domain'
import { MapPin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { useShopFormat } from '@/hooks/use-shop-format'
import { StartReturnForm } from './start-return-form'

export type ReturnPromise = { readonly shopName: string; readonly opening: ShopOpening | undefined; readonly timeZone: string; readonly currency: string; readonly holdCents: number | null }

// When a person will look, in the shop's own hours: today while it is open, at the next opening, or, with no hours
// given, when it next opens.
export function useWhenChecked({ shopName, opening, timeZone, currency }: ReturnPromise) {
  const t = useTranslations('selfReturn.renter.when')
  const format = useShopFormat({ timeZone, currency })
  if (opening === undefined) return t('unknown', { shop: shopName })
  return opening.open ? t('open', { shop: shopName }) : t('later', { shop: shopName, when: format.when(opening.opensAt) })
}

// The shop's own words for where to leave the item, exactly as it wrote them.
export function DropPointCard({ shopName, dropPoint }: { shopName: string; dropPoint: string }) {
  const t = useTranslations('selfReturn.renter.intro')
  return (
    <Panel title={t('dropPointLabel')}>
      <div className="flex gap-3 px-4 py-4 md:px-5">
        <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
        <figure className="grid min-w-0 gap-1.5">
          <blockquote className="text-lg leading-snug font-semibold whitespace-pre-wrap wrap-long-words">{dropPoint}</blockquote>
          <figcaption className="text-sm text-muted-foreground">{t('writtenBy', { shop: shopName })}</figcaption>
        </figure>
      </div>
    </Panel>
  )
}

// Before the camera: where to leave it, and the promise that nothing is charged before a person has seen it.
export function ReturnIntro({ token, canAct, dropPoint, promise }: { token: string; canAct: boolean; dropPoint: string | null; promise: ReturnPromise }) {
  const t = useTranslations('selfReturn.renter.intro')
  const format = useShopFormat({ timeZone: promise.timeZone, currency: promise.currency })
  const whenChecked = useWhenChecked(promise)
  return (
    <div className="grid gap-6">
      {dropPoint === null ? null : <DropPointCard shopName={promise.shopName} dropPoint={dropPoint} />}
      <Panel title={t('nextLabel')}>
        <div className="grid gap-2.5 px-4 py-4 text-pretty md:px-5">
          <p><strong>{t('nothingCharged')}</strong> {whenChecked}</p>
          {promise.holdCents === null ? null : <p>{t('holdStays', { amount: format.money(promise.holdCents) })}</p>}
        </div>
      </Panel>
      <div className="grid gap-2 text-pretty">
        <p>{t('how')}</p>
        <p className="text-muted-foreground">{t('light')}</p>
      </div>
      {canAct ? <StartReturnForm token={token} /> : <p role="note" className="text-muted-foreground">{t('noScope')}</p>}
    </div>
  )
}
