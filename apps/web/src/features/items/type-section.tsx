import type { CatalogItem, CatalogType } from '@hold/db'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { itemRoutes } from '@/lib/routes'
import { AddItemsForm } from './add-items-form'
import { ItemList } from './item-list'
import { TypeFacts } from './type-facts'

type TypeSectionProps = { type: CatalogType; items: readonly CatalogItem[]; clock: ShopClock; canManage: boolean }

// One item type: its terms, its items and, for those who may, a way to change it or add to it. Sample types belong
// to the sample rentals, so nobody changes them.
export function TypeSection({ type, items, clock, canManage }: TypeSectionProps) {
  const t = useTranslations('shop.items')
  const changeable = canManage && !type.simulated
  const aside = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm text-muted-foreground">{t(`categories.${type.category}`)}</span>
      {type.simulated ? <SampleTag /> : null}
      {changeable ? (
        <Link
          href={itemRoutes.type(type.id)}
          aria-label={t('type.editNamed', { name: type.name })}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          {t('type.edit')}
        </Link>
      ) : null}
    </div>
  )

  return (
    <Panel title={type.name} aside={aside}>
      <TypeFacts type={type} clock={clock} />
      {type.simulated ? <p className="border-b px-4 py-2.5 text-[0.8125rem] text-muted-foreground md:px-5">{t('type.sampleNote')}</p> : null}
      {items.length === 0 ? <p className="px-4 py-5 text-muted-foreground md:px-5">{t('type.noItems')}</p> : <ItemList items={items} clock={clock} />}
      {changeable ? <AddItemsForm itemTypeId={type.id} typeName={type.name} /> : null}
    </Panel>
  )
}
