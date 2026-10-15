import type { PublishedPriceList } from '@hold/db'
import { useFormatter, useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'
import { PasskeyGate } from './passkey-gate'
import { PriceListEditor } from './price-list-editor'
import { ShopFrame } from './shop-frame'

type PricesScreenProps = {
  shopName: string
  current: PublishedPriceList | undefined
  editor: ComponentProps<typeof PriceListEditor>
  canPublish: boolean
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

export function PricesScreen({ shopName, current, editor, canPublish, gate }: PricesScreenProps) {
  const t = useTranslations('shop.prices')
  const format = useFormatter()

  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid max-w-3xl gap-10">
        <p className="max-w-prose text-lead text-muted-foreground">
          {current === undefined
            ? t('none')
            : t('current', { version: current.version, date: format.dateTime(current.publishedAt, { dateStyle: 'medium' }) })}
        </p>
        {canPublish ? (
          <PasskeyGate {...gate} returnTo="/shop/prices">
            <PriceListEditor {...editor} />
          </PasskeyGate>
        ) : (
          <p className="text-muted-foreground">{t('readOnly')}</p>
        )}
      </div>
    </ShopFrame>
  )
}
