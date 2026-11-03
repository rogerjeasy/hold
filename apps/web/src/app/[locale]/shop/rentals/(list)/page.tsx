import { inShop, rentalList } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { readRentalFilter } from '@/features/rentals/rental-standing'
import { RentalsScreen } from '@/features/rentals/rentals-screen'
import { linkRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.rentals')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const context = await requireShop()
  const { database, config } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const rentals = await inShop(database, scope, (transaction) => rentalList(transaction, new Date()))
  return (
    <RentalsScreen
      shopName={context.shop.name}
      clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }}
      rentals={rentals}
      show={readRentalFilter((await searchParams).show)}
      canBook={context.role !== 'read_only'}
      shopPageUrl={`${config.publicUrl}${linkRoutes.shopPage}/${context.shop.slug}`}
    />
  )
}
