import { useTranslations } from 'next-intl'
import { exampleRental, priceListKeys } from './example-rental'
import { useExampleMoney } from './use-example-money'

// The list a renter reads before renting. A claim is priced from it and can never exceed it.
export function PriceListCard() {
  const t = useTranslations('priceList')
  const shop = useTranslations('bothSides.renter')
  const money = useExampleMoney()

  return (
    <figure className="border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3 md:px-6">
        <p className="font-bold">{t('title')}</p>
        <p className="label text-xs text-muted-foreground">{shop('shopName')}</p>
      </div>
      <dl className="px-4 md:px-6">
        {priceListKeys.map((key) => (
          <div key={key} className="flex items-baseline justify-between gap-4 border-b py-3.5">
            <dt className="min-w-0 text-[1.0625rem]">{t(`items.${key}`)}</dt>
            <dd className="figures font-medium">{money(exampleRental.priceListCents[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 py-3.5 text-[0.9375rem] text-muted-foreground md:px-6">{t('wear')}</p>
      <figcaption className="border-t px-4 py-2.5 text-sm text-muted-foreground md:px-6">
        {t('agreed')} {t('example')}
      </figcaption>
    </figure>
  )
}
