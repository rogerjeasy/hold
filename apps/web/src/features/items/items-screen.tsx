import type { ItemCatalog } from '@hold/db'
import { Bike, Plus, ReceiptText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { itemRoutes, shopRoutes } from '@/lib/routes'
import { FleetGrid } from './fleet-grid'
import type { FleetRow } from './fleet-rows'
import { ItemsSummary } from './items-summary'
import { shows } from './standing'
import type { ItemFilter } from './standing'
import { StandingFilter } from './standing-filter'
import { TypeSection } from './type-section'

export type ItemsScreenProps = { shopName: string; clock: ShopClock; catalog: ItemCatalog; fleet: readonly FleetRow[]; show: ItemFilter; canManage: boolean }

function NewTypeLink() {
  const t = useTranslations('shop.items')
  return (
    <Link href={itemRoutes.newType} className={buttonVariants()}>
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
      <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
        <div className="surface max-w-2xl">
          <EmptyState
            icon={ReceiptText}
            title={t('needsPrices.title')}
            body={t('needsPrices.body')}
            action={
              <Link href={shopRoutes.prices} className={buttonVariants()}>
                {t('needsPrices.action')}
              </Link>
            }
          />
        </div>
      </ShopFrame>
    )
  }

  // A shop's own types first, the samples after them.
  const types = [...catalog.types].sort((a, b) => Number(a.simulated) - Number(b.simulated))
  const sections = types
    .map((type) => ({ type, items: catalog.items.filter((item) => item.itemTypeId === type.id && shows(show, item.standing)) }))
    .filter((section) => show === 'all' || section.items.length > 0)
  const empty = catalog.types.length === 0

  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')} actions={canManage && !empty ? <NewTypeLink /> : undefined}>
      <div className="grid min-w-0 gap-8">
        {!canManage ? <p className="text-muted-foreground">{t('readOnly')}</p> : null}
        {empty ? (
          <div className="surface max-w-2xl">
            <EmptyState icon={Bike} title={t('empty.title')} body={t('empty.body')} action={canManage ? <NewTypeLink /> : undefined} />
          </div>
        ) : (
          <>
            <ItemsSummary catalog={catalog} />
            <div className="grid min-w-0 gap-4">
              <StandingFilter show={show} />
              {sections.length === 0 ? (
                <p className="surface px-5 py-8 text-center text-muted-foreground">{t('filter.none')}</p>
              ) : null}
              {fleet.some((row) => row.kind === 'item') ? (
                <div className="hidden min-w-0 md:block">
                  <FleetGrid rows={fleet} clock={clock} canManage={canManage} />
                </div>
              ) : null}
            </div>
            {sections.length === 0 ? null : (
              <div className="stagger grid min-w-0 items-start gap-5 xl:grid-cols-2">
                {sections.map(({ type, items }) => (
                  <TypeSection key={type.id} type={type} items={items} clock={clock} canManage={canManage} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ShopFrame>
  )
}
