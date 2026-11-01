'use server'

import { readLocale } from '@/features/auth/locale-input'
import { renterAction, renterInput } from '@/server/renter-access'
import { confirmExtensionPayment, quoteRenterExtension, startExtensionPayment } from '@/server/extension'

// What a renter does to keep the item longer (architecture.md section 6.14). Each is built by renterAction, which checks
// the link, its extend scope and the network's rate first. No amount comes from the renter: Hold prices the days, and
// the renter approves that price in PayPal.

export const askExtension = renterAction(
  { name: 'renter.extension_quoted', scope: 'extend', input: renterInput('ask-extension') },
  (link, input, inLinkShop) => quoteRenterExtension(link, inLinkShop, input.endsAt, 'link'),
)

export const payExtension = renterAction({ name: 'renter.extension_started', scope: 'extend', input: renterInput('pay-extension') }, (link, input, inLinkShop) =>
  startExtensionPayment(link, inLinkShop, input.token, readLocale(input.locale), input.returnTo ?? 'page'),
)

export const confirmExtension = renterAction({ name: 'renter.extension_confirmed', scope: 'extend', input: renterInput('confirm-extension') }, (link, input, inLinkShop) =>
  confirmExtensionPayment(link, inLinkShop, input.orderId),
)
