import { inShop, shopIncidents } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { IncidentsScreen } from '@/features/incidents/incidents-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('shop.incidents'))('title'), robots: { index: false, follow: false } }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const context = await requireShop()
  const waitingOnly = (await searchParams).show !== 'all'
  const { database } = await getServices()
  const incidents = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => shopIncidents(transaction, { waiting: waitingOnly }))
  return <IncidentsScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} incidents={incidents} waitingOnly={waitingOnly} canAct={context.role !== 'read_only'} />
}
