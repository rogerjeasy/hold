import 'server-only'
import { demoSessionLive, inShop, latestOwnBooking, shopSettings } from '@hold/db'
import { readDemoSession } from '@/features/auth/session-cookies'
import { getServices } from '@/server/services'

export type DemoShop = { readonly shopId: string; readonly slug: string; readonly name: string }

// The demo shop this browser started, proved by its sealed cookie, while it is in its week. No assistant can find it
// otherwise.
export async function demoShop(): Promise<DemoShop | undefined> {
  const session = await readDemoSession()
  if (session === undefined) return undefined
  const { database } = await getServices()
  if (!(await demoSessionLive(database, session.shopId))) return undefined
  const settings = await inShop(database, { role: 'hold_app', shopId: session.shopId }, (transaction) => shopSettings(transaction, session.shopId))
  return settings === undefined ? undefined : { shopId: session.shopId, slug: settings.slug, name: settings.name }
}

// Whether the page may offer "Ask about my latest booking": the demo shop has a booking of its own, not a sample, that
// no assistant follows yet.
export async function latestBookingToAsk(): Promise<boolean> {
  const shop = await demoShop()
  if (shop === undefined) return false
  const { database } = await getServices()
  const latest = await inShop(database, { role: 'hold_app', shopId: shop.shopId }, (transaction) => latestOwnBooking(transaction))
  return latest?.followable === true
}
