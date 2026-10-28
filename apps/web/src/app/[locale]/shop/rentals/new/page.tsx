import { bookableTypes, findPayPalAccount, inShop } from '@hold/db'
import { shopDay } from '@hold/domain'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { readPeriod } from '@/components/booking/period'
import { NewRentalScreen } from '@/features/rentals/new-rental-screen'
import { redirect } from '@/i18n/navigation'
import { shopRoutes } from '@/lib/routes'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.rentals.form')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const context = await requireShop()
  const { currency } = context.shop
  // Only staff book, and every amount is in the shop's currency, set by its first price list.
  if (context.role === 'read_only' || currency === null) return redirect({ href: shopRoutes.rentals, locale: await getLocale() })
  const { database, config } = await getServices()
  const now = new Date()
  const period = readPeriod(await searchParams, context.shop.timeZone, now)
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const loaded = await inShop(database, scope, async (transaction) => ({
    paypal: await findPayPalAccount(transaction, context.shop.id, config.paypalMode),
    types: period.period === undefined ? [] : await bookableTypes(transaction, period.period, now),
    any: (await bookableTypes(transaction, { startsAt: now, endsAt: now }, now)).length > 0,
  }))
  const ready = loaded.paypal === undefined ? 'needs_paypal' : loaded.any ? 'ready' : 'needs_items'
  // A walk-in may approve the fee and the hold at once only for a rental that starts on the shop's own today.
  const startsToday = period.period !== undefined && period.period.startsAt < shopDay(context.shop.timeZone, now).end
  return <NewRentalScreen shopName={context.shop.name} currency={currency} period={period} types={loaded.types} ready={ready} startsToday={startsToday} />
}
