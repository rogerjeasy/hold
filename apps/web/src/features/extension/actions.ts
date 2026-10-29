'use server'

import { EXTENSION_LIMITS } from '@hold/domain'
import { checkExtensionPayment as markChecked, saveExtensionMaxDays } from '@hold/db'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

// The most extra days a renter may add from their phone, with nobody to ask (architecture.md section 6.14). Only the
// owner decides; zero turns extensions off.
export const saveExtensionSettings = shopAction(
  { name: 'shop.extension_settings_saved', roles: ['owner'], needsPasskey: false, input: withLocale({ maxDays: z.coerce.number().int().min(0).max(EXTENSION_LIMITS.maxDays) }) },
  async (context, input, transaction) => {
    await saveExtensionMaxDays(transaction, context.shop.id, input.maxDays)
    return {}
  },
)

// Money PayPal moved for extra days that Hold did not apply as quoted, checked in PayPal by an owner or manager, who
// refunds it there or extends the rental again. It leaves the decision board; the money log keeps what PayPal shows.
export const checkExtensionPayment = shopAction(
  { name: 'extension.payment_checked', roles: ['owner', 'manager'], needsPasskey: false, input: withLocale({ extensionId: z.uuid() }) },
  async (context, input, transaction) => {
    const checked = await markChecked(transaction, input.extensionId, context.person.userId, new Date())
    return checked.ok ? { rentalId: checked.rentalId } : new Refusal(checked.reason)
  },
)
