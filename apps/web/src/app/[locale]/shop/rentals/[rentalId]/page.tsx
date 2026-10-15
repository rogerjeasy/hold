import { inShop, rentalDetail } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RentalScreen } from '@/features/rentals/rental-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.rentals.detail')
  return { title: t('label'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ rentalId: string }> }) {
  const { rentalId } = await params
  const context = await requireShop()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const rental = await inShop(database, scope, (transaction) => rentalDetail(transaction, rentalId, new Date()))
  // Another shop's rental and a made-up address read the same.
  if (rental === undefined) notFound()
  return <RentalScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} rental={rental} canAct={context.role !== 'read_only'} />
}
