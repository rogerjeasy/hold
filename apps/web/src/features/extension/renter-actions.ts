'use server'

import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { renterAction, withToken } from '@/server/renter-access'
import { confirmExtensionPayment, quoteRenterExtension, startExtensionPayment } from '@/server/extension'

// What a renter does to keep the item longer (architecture.md section 6.14). Each is built by renterAction, which checks
// the link, its extend scope and the network's rate first. No amount comes from the renter: Hold prices the days, and
// the renter approves that price in PayPal.

export const askExtension = renterAction(
  { name: 'renter.extension_quoted', scope: 'extend', input: withToken({ endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }) },
  (link, input, inLinkShop) => quoteRenterExtension(link, inLinkShop, input.endsAt, 'link'),
)

export const payExtension = renterAction({ name: 'renter.extension_started', scope: 'extend', input: withToken({}) }, (link, input, inLinkShop) =>
  startExtensionPayment(link, inLinkShop, input.token, readLocale(input.locale)),
)

export const confirmExtension = renterAction({ name: 'renter.extension_confirmed', scope: 'extend', input: withToken({ orderId: z.string().min(1).max(64) }) }, (link, input, inLinkShop) =>
  confirmExtensionPayment(link, inLinkShop, input.orderId),
)
