import { activeHolds, fleetRecords, inShop, itemCatalog, moneyLedgerRecords, savedInsightsDashboard } from '@hold/db'
import { shopYear } from '@hold/domain'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { insightsTables } from '@/features/insights/insights-tables'
import { InsightsScreen } from '@/features/insights/insights-screen'
import { fleetRows } from '@/features/items/fleet-rows'
import { ledgerRows } from '@/features/money/ledger-rows'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('insights'))('title'), robots: { index: false, follow: false } }
}

// The insights dashboard (extensions.md section 12.5): the money ledger's lines and the fleet's items, read inside the
// shop alone and shaped on the server, naming no renter, for the owner and managers only.
export default async function Page() {
  const context = await requireShop()
  const canDecide = context.role === 'owner' || context.role === 'manager'
  const { config, database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [records, catalog, fleet, live, saved] = canDecide
    ? await Promise.all([inShop(database, scope, moneyLedgerRecords), inShop(database, scope, itemCatalog), inShop(database, scope, fleetRecords), inShop(database, scope, activeHolds), inShop(database, scope, savedInsightsDashboard)])
    : [{ lines: [], rentals: [] }, { types: [], items: [] }, [], [], undefined]
  const now = new Date()
  const ledger = ledgerRows(records, context.shop.timeZone)
  const money = await getTranslations('money')
  const insights = await getTranslations('insights')
  const tables = insightsTables({ lines: ledger.rows, rentals: ledger.rentals, fleet: fleetRows(catalog, fleet, shopYear(context.shop.timeZone, now), 'all'), holds: live, now }, {
    kind: (kind) => money(`kinds.${kind}`),
    flow: (flow) => money(`flows.${flow}`),
    where: (where) => (where === 'none' ? insights('whereNone') : money(`filter.${where}`)),
    agrees: money('checks.agrees'),
    needsLook: money('filter.check'),
    yes: insights('yes'),
    no: insights('no'),
    rung: (rung) => (rung === null ? insights('custom.noRung') : insights('custom.rung', { rung })),
    standing: (standing) => insights(`custom.standing.${standing}`),
  })
  return <InsightsScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} tables={tables} saved={saved} canDecide={canDecide} licenceKey={config.studioLicenceKey} />
}
