import { dropOffsWaiting, inShop, rentalDetail, rentalExtensionsOf, rentalHandovers, rentalHold, rentalReturns } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RentalScreen } from '@/features/rentals/rental-screen'
import { dropOffEntries } from '@/server/drop-offs'
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
  const { rental, hold, handovers, returns, dropOffs, extensions } = await inShop(database, scope, async (transaction) => {
    const found = await rentalDetail(transaction, rentalId, new Date())
    if (found === undefined) return { rental: undefined, hold: undefined, handovers: [], returns: [], dropOffs: [], extensions: [] }
    const waiting = found.state === 'dropped_off' ? (await dropOffsWaiting(transaction)).filter((entry) => entry.rentalId === found.id) : []
    return { rental: found, hold: await rentalHold(transaction, found.id), handovers: await rentalHandovers(transaction, found.id), returns: await rentalReturns(transaction, found.id), dropOffs: waiting, extensions: await rentalExtensionsOf(transaction, found.id) }
  })
  // Another shop's rental and a made-up address read the same.
  if (rental === undefined) notFound()
  return <RentalScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} rental={rental} hold={hold} handovers={handovers} returns={returns} dropOff={(await dropOffEntries(dropOffs))[0]} extensions={extensions} canAct={context.role !== 'read_only'} />
}
