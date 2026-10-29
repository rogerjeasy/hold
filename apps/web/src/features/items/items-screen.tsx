import type { ItemCatalog } from '@hold/db'
import { FleetGrid } from './fleet-grid'
import type { FleetRow } from './fleet-rows'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { itemRoutes, shopRoutes } from '@/lib/routes'
import { ItemsSummary } from './items-summary'
import { shows } from './standing'
import type { ItemFilter } from './standing'
import { StandingFilter } from './standing-filter'
import { TypeSection } from './type-section'

export type ItemsScreenProps = { shopName: string; clock: ShopClock; catalog: ItemCatalog; fleet: readonly FleetRow[]; show: ItemFilter; canManage: boolean }

function NewTypeLink() {
  const t = useTranslations('shop.items')
  return (
    <Link href={itemRoutes.newType} className={buttonVariants({ className: 'justify-self-start' })}>
      <Plus aria-hidden="true" />
      {t('newType')}
    </Link>
  )
}

// The shop's items: the four numbers that say where they all are, the fleet as a grid of types and their items from md
// (extensions.md section 12.5), and each type with its terms, its items on a phone, and a way to add more.
export function ItemsScreen({ shopName, clock, catalog, fleet, show, canManage }: ItemsScreenProps) {
  const t = useTranslations('shop.items')

  if (clock.currency === null) {
    return (
      <ShopFrame shopName={shopName} title={t('title')}>
        <div className="grid max-w-prose gap-4">
          <Notice title={t('needsPrices.title')} body={t('needsPrices.body')} />
          <Link href={shopRoutes.prices} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            {t('needsPrices.action')}
          </Link>
        </div>
      </ShopFrame>
    )
  }

  // A shop's own types first, the samples after them.
  const types = [...catalog.types].sort((a, b) => Number(a.simulated) - Number(b.simulated))
  const sections = types
    .map((type) => ({ type, items: catalog.items.filter((item) => item.itemTypeId === type.id && shows(show, item.standing)) }))
    .filter((section) => show === 'all' || section.items.length > 0)

  return (
    <ShopFrame shopName={shopName} title={t('title')}>
      <div className="grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-prose text-lead text-muted-foreground">{t('lead')}</p>
          {canManage ? <NewTypeLink /> : null}
        </div>
        {!canManage ? <p className="text-muted-foreground">{t('readOnly')}</p> : null}
        {catalog.types.length === 0 ? (
          <div className="grid max-w-prose gap-4">
            <Notice title={t('empty.title')} body={t('empty.body')} />
            {canManage ? <NewTypeLink /> : null}
          </div>
        ) : (
          <>
            <ItemsSummary catalog={catalog} />
            <StandingFilter show={show} />
            {sections.length === 0 ? <p className="text-muted-foreground">{t('filter.none')}</p> : null}
            {fleet.some((row) => row.kind === 'item') ? (
              <div className="hidden min-w-0 gap-2 md:grid">
                <FleetGrid rows={fleet} clock={clock} canManage={canManage} />
                <p className="text-sm text-muted-foreground">{t('fleet.keys')}</p>
              </div>
            ) : null}
            {sections.map(({ type, items }) => (
              <TypeSection key={type.id} type={type} items={items} clock={clock} canManage={canManage} />
            ))}
          </>
        )}
      </div>
    </ShopFrame>
  )
}
