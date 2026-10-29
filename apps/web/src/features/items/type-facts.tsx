import type { CatalogType } from '@hold/db'
import { useTranslations } from 'next-intl'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

function Fact({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold wrap-long-words">{value}</dd>
    </div>
  )
}

// What a renter is held and charged for one item of a type, and what goes out with it.
export function TypeFacts({ type, clock }: { type: CatalogType; clock: ShopClock }) {
  const t = useTranslations('shop.items.type')
  const format = useShopFormat(clock)
  const kit = type.accessories.length === 0 ? t('noKit') : type.accessories.map((accessory) => t('kitItem', { count: accessory.count, name: accessory.name })).join(', ')
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b px-4 py-4 sm:grid-cols-4 md:px-5 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]">
      <Fact label={t('hold')} value={format.money(type.holdCents)} />
      <Fact label={t('dayRate')} value={format.money(type.dayRateCents)} />
      <Fact label={t('value')} value={format.money(type.valueCents)} />
      <Fact label={t('photoPlan')} value={t('views', { count: type.views.length })} />
      <Fact label={t('kit')} value={kit} className="col-span-2 sm:col-span-4 lg:col-span-1" />
    </dl>
  )
}
