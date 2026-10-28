import { addDays, shopDay } from '@hold/domain'
import { inShop, shopCalendar } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CalendarScreen } from '@/features/calendar/calendar-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('shop.calendar'))('title'), robots: { index: false, follow: false } }
}

// The shop's last week and next three, from the start of its own day.
const WEEKS_BEFORE = 1
const WEEKS_AFTER = 3

export default async function Page() {
  const context = await requireShop()
  const { database } = await getServices()
  const today = shopDay(context.shop.timeZone, new Date()).start
  const window = { from: addDays(today, -7 * WEEKS_BEFORE), to: addDays(today, 7 * WEEKS_AFTER) }
  const calendar = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, (transaction) => shopCalendar(transaction, window))
  return <CalendarScreen shopName={context.shop.name} clock={{ timeZone: context.shop.timeZone, currency: context.shop.currency }} window={window} calendar={calendar} />
}
