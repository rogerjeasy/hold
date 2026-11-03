import { ReceiptText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { exampleRental, priceListKeys } from './example-rental'
import { useExampleMoney } from './use-example-money'

// The list a renter reads before renting. A claim is priced from it and can never exceed it.
export function PriceListCard() {
  const t = useTranslations('priceList')
  const shop = useTranslations('bothSides.renter')
  const money = useExampleMoney()

  return (
    <figure className="surface overflow-clip shadow-raised">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/70 px-5 py-4 md:px-6">
        <p className="flex items-center gap-2.5 font-bold">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <ReceiptText className="size-4" />
          </span>
          {t('title')}
        </p>
        <p className="label text-xs text-muted-foreground">{shop('shopName')}</p>
      </div>
      <dl className="px-5 md:px-6">
        {priceListKeys.map((key) => (
          <div key={key} className="flex items-baseline gap-3 border-b border-border/70 py-4">
            {/* A dotted leader runs from the item to its price, as on a printed list. */}
            <dt className="flex min-w-0 flex-1 items-baseline gap-3 text-[1.0625rem] after:min-w-4 after:flex-1 after:-translate-y-[0.3em] after:border-b after:border-dotted after:border-border-strong">
              {t(`items.${key}`)}
            </dt>
            <dd className="figures font-semibold">{money(exampleRental.priceListCents[key])}</dd>
          </div>
        ))}
      </dl>
      <p className="px-5 py-4 text-[0.9375rem] text-muted-foreground md:px-6">{t('wear')}</p>
      <figcaption className="border-t border-border/70 bg-muted/40 px-5 py-3 text-sm text-muted-foreground md:px-6">
        {t('agreed')} {t('example')}
      </figcaption>
    </figure>
  )
}
