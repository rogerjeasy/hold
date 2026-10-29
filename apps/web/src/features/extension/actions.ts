'use server'

import { EXTENSION_LIMITS } from '@hold/domain'
import { saveExtensionMaxDays } from '@hold/db'
import { z } from 'zod'
import { shopAction, withLocale } from '@/server/shop-access'

// The most extra days a renter may add from their phone, with nobody to ask (architecture.md section 6.14). Only the
// owner decides; zero turns extensions off.
export const saveExtensionSettings = shopAction(
  { name: 'shop.extension_settings_saved', roles: ['owner'], needsPasskey: false, input: withLocale({ maxDays: z.coerce.number().int().min(0).max(EXTENSION_LIMITS.maxDays) }) },
  async (context, input, transaction) => {
    await saveExtensionMaxDays(transaction, context.shop.id, input.maxDays)
    return {}
  },
)
