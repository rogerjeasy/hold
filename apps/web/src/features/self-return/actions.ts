'use server'

import { checkSelfReturnSettings } from '@hold/domain'
import { confirmDropOff as confirmRentalDropOff, reportDropOffMissing as reportRentalDropOffMissing, saveSelfReturnSettings as saveShopSettings } from '@hold/db'
import { z } from 'zod'
import { tellRenterNotFound } from '@/server/drop-off-notice'
import { CAPTURE_STAFF } from '@/server/staff-photo'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

// What staff do about a return with nobody at the counter (architecture.md section 6.13). Saying the item is at the
// drop point makes the rental returned, and the ordinary review follows; saying it is not there is recorded once and the
// renter is told. Neither moves money, so counter staff may do both.

const rental = { rentalId: z.uuid() }
const clockTime = z.string().max(5)

// Only the owner decides whether renters may return items with nobody there, and where they leave them.
export const saveSelfReturnSettings = shopAction(
  { name: 'shop.self_return_settings_saved', roles: ['owner'], needsPasskey: false, input: withLocale({ allowed: z.enum(['on', 'off']).optional(), dropPoint: z.string().max(1000), opens: clockTime, closes: clockTime }) },
  async (context, input, transaction) => {
    const hours = input.opens === '' && input.closes === '' ? null : { opens: input.opens, closes: input.closes }
    const checked = checkSelfReturnSettings({ allowed: input.allowed === 'on', dropPoint: input.dropPoint, hours })
    if (!checked.ok) return new Refusal(checked.error)
    await saveShopSettings(transaction, context.shop.id, checked.value)
    return {}
  },
)

export const confirmDropOff = shopAction(
  { name: 'rental.drop_off_confirmed', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale(rental) },
  async (_context, input, transaction) => {
    const confirmed = await confirmRentalDropOff(transaction, input.rentalId)
    return confirmed.ok ? { rentalId: input.rentalId } : new Refusal(confirmed.reason)
  },
)

export const reportDropOffMissing = shopAction(
  { name: 'rental.drop_off_missing', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale(rental) },
  async (context, input, transaction) => {
    const now = new Date()
    const reported = await reportRentalDropOffMissing(transaction, input.rentalId, context.person.userId, now)
    if (!reported.ok) return new Refusal(reported.reason)
    return { sent: await tellRenterNotFound(transaction, context.shop, input.rentalId, now) }
  },
)
