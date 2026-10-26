'use server'

import { confirmIncidentPrice, makeShopMatter } from '@hold/db'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

// What staff do with a renter's report (extensions.md section 10). A test checks this file exports nothing else.
const STAFF = ['owner', 'manager', 'counter_staff'] as const

// The model only suggested a price; a named staff member confirms which entry of the agreed list applies.
export const confirmPrice = shopAction({ name: 'incident.price_confirmed', roles: STAFF, needsPasskey: false, input: withLocale({ incidentId: z.uuid(), priceEntryId: z.uuid() }) }, async (context, input, transaction) => {
  const result = await confirmIncidentPrice(transaction, input.incidentId, context.person.userId, input.priceEntryId, new Date())
  return result.ok ? result : new Refusal(result.reason)
})

// A fault, or anything staff take on themselves, becomes the shop's matter. No claim line can come from it.
export const takeOnAsShopMatter = shopAction({ name: 'incident.shop_matter', roles: STAFF, needsPasskey: false, input: withLocale({ incidentId: z.uuid() }) }, async (_context, input, transaction) => {
  const result = await makeShopMatter(transaction, input.incidentId)
  return result.ok ? result : new Refusal(result.reason)
})
