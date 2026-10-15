import type { CatalogItem } from '@hold/db'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { itemRoutes } from '@/lib/routes'
import { RentalNote } from './rental-note'
import { StandingBadge } from './standing-badge'

// One grid for the column heads and the rows from md, so they line up. Below md each row stacks.
const columns = 'md:grid md:grid-cols-[minmax(0,1.4fr)_5rem_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center md:gap-x-4'

function ItemRow({ item, clock }: { item: CatalogItem; clock: ShopClock }) {
  const t = useTranslations('shop.items.columns')
  const labelId = useId()
  return (
    <li aria-labelledby={labelId} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-4 py-3 last:border-b-0 md:px-5 md:py-1.5 ${columns}`}>
      <Link id={labelId} href={itemRoutes.item(item.id)} className="inline-flex min-h-11 min-w-0 items-center font-semibold underline-offset-4 wrap-long-words hover:underline">
        {item.label}
      </Link>
      <p className={`col-start-1 text-sm text-muted-foreground md:col-start-auto md:text-foreground ${item.size === null ? 'max-md:hidden' : ''}`}>
        <span className="md:sr-only">{t('size')} </span>
        {item.size ?? '—'}
      </p>
      <p className={`figures col-start-1 min-w-0 truncate text-sm text-muted-foreground md:col-start-auto ${item.serial === null ? 'max-md:hidden' : ''}`}>
        <span className="font-sans md:sr-only">{t('serial')} </span>
        {item.serial ?? '—'}
      </p>
      <div className="col-start-2 row-span-3 row-start-1 min-w-0 justify-self-end text-right md:col-start-auto md:row-span-1 md:row-start-auto md:justify-self-start md:text-left">
        <StandingBadge standing={item.standing} />
        <RentalNote rental={item.rental} clock={clock} />
      </div>
    </li>
  )
}

export function ItemList({ items, clock }: { items: readonly CatalogItem[]; clock: ShopClock }) {
  const t = useTranslations('shop.items.columns')
  return (
    <>
      <div aria-hidden="true" className={`label hidden border-b px-5 py-2.5 text-[0.6875rem] text-muted-foreground ${columns}`}>
        <span>{t('item')}</span>
        <span>{t('size')}</span>
        <span>{t('serial')}</span>
        <span>{t('standing')}</span>
      </div>
      <ul>
        {items.map((item) => (
          <ItemRow key={item.id} item={item} clock={clock} />
        ))}
      </ul>
    </>
  )
}
