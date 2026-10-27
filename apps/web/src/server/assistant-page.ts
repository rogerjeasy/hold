import 'server-only'
import { inShop, rentalAssistant, renterView } from '@hold/db'
import type { AssistantView } from '@/features/assistant/assistant-screen'
import { renterAccess } from './renter-access'
import { getServices } from './services'

export type AssistantPage = { readonly ok: true; readonly view: AssistantView } | { readonly ok: false; readonly failure: 'link_invalid' | 'scope' | 'rate_limited' }

// What the renter's own assistant did on the rental, read through any link to it. A rental no assistant booked answers
// as an unusable link, so the page reveals nothing.
export async function assistantPage(token: string): Promise<AssistantPage> {
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return access
  const { database } = await getServices()
  const { rentalId, shopId } = access.link
  const loaded = await inShop(database, { role: 'hold_app', shopId }, async (transaction) => ({ assistant: await rentalAssistant(transaction, rentalId), view: await renterView(transaction, rentalId, now) }))
  if (loaded.assistant === undefined || loaded.view === undefined) return { ok: false, failure: 'link_invalid' }
  return { ok: true, view: { ...loaded.assistant, shopName: loaded.view.shopName, timeZone: loaded.view.timeZone, currency: loaded.view.currency } }
}
