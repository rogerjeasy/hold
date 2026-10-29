import { inShop, moneyLedgerRecords } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GridLicence } from '@/components/grid/grid-licence'
import { ledgerRows } from '@/features/money/ledger-rows'
import { MoneyScreen } from '@/features/money/money-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('money'))('title'), robots: { index: false, follow: false } }
}

// The money ledger (extensions.md section 12.5): every staff member reads it, inside the shop alone.
export default async function Page() {
  const context = await requireShop()
  const { config, database } = await getServices()
  const records = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => moneyLedgerRecords(transaction))
  const { rows, rentals } = ledgerRows(records, context.shop.timeZone)
  return (
    <>
      <GridLicence licenceKey={config.gridLicenceKey} />
      <MoneyScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} rows={rows} rentals={rentals} />
    </>
  )
}
