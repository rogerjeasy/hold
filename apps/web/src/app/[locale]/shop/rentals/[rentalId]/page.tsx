import { dropOffsWaiting, inShop, rentalDetail, rentalExtensionsOf, rentalHandovers, rentalHold, rentalPayPalRecord, rentalReturns, textsOf } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { RentalScreen } from '@/features/rentals/rental-screen'
import { dropOffEntries } from '@/server/drop-offs'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.rentals.detail')
  return { title: t('label'), robots: { index: false, follow: false } }
}

export default async function Page({ params, searchParams }: { params: Promise<{ rentalId: string }>; searchParams: Promise<{ link?: string | string[] }> }) {
  const { rentalId } = await params
  // Set by the booking form when the day's email allowance held the renter's link.
  const linkHeld = (await searchParams).link === 'held'
  const context = await requireShop()
  // A made-up address reads as one of another shop's rentals does, before anything is read.
  if (!z.guid().safeParse(rentalId).success) notFound()
  const { database } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  // Two transactions side by side, each bound to the shop: deployed, each statement is a call to the Data API, and the
  // rental's PayPal record need not wait for the rest. Another shop's rental reads as nothing in both.
  const [{ rental, hold, handovers, returns, dropOffs }, { extensions, texts, paypal }] = await Promise.all([
    inShop(database, scope, async (transaction) => {
      const found = await rentalDetail(transaction, rentalId, new Date())
      if (found === undefined) return { rental: undefined, hold: undefined, handovers: [], returns: [], dropOffs: [] }
      const waiting = found.state === 'dropped_off' ? (await dropOffsWaiting(transaction)).filter((entry) => entry.rentalId === found.id) : []
      return { rental: found, hold: await rentalHold(transaction, found.id), handovers: await rentalHandovers(transaction, found.id), returns: await rentalReturns(transaction, found.id), dropOffs: waiting }
    }),
    inShop(database, scope, async (transaction) => ({ extensions: await rentalExtensionsOf(transaction, rentalId), texts: await textsOf(transaction, rentalId), paypal: await rentalPayPalRecord(transaction, rentalId) })),
  ])
  if (rental === undefined) notFound()
  return <RentalScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} rental={rental} hold={hold} handovers={handovers} returns={returns} dropOff={(await dropOffEntries(dropOffs))[0]} extensions={extensions} texts={texts} paypal={paypal} canAct={context.role !== 'read_only'} canErase={context.role === 'owner'} linkHeld={linkHeld} />
}
