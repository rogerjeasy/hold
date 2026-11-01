'use server'
import { randomBytes } from 'node:crypto'
import { registerRenterPush, unregisterRenterPush } from '@hold/db'
import { readLocale } from '@/features/auth/locale-input'
import { renterAction, renterInput } from '@/server/renter-access'

// A renter's phone asks for push notifications about this rental (architecture.md section 13.9), through the link it
// holds: renterAction checks the link and its view scope, the rate and the input first. The phone is bound to the
// rental and to this link, and hears nothing once the link is revoked or expires. It is given a random reference to
// keep beside its saved link, since a push never carries the link.
export const registerPush = renterAction({ name: 'renter.push_registered', scope: 'view', input: renterInput('register-push') }, (link, input, inLinkShop) =>
  inLinkShop((transaction) =>
    registerRenterPush(transaction, link, { token: input.pushToken, platform: input.platform, locale: readLocale(input.locale) }, randomBytes(16).toString('base64url'), new Date()),
  ),
)

// Pushes about this rental turned off on this phone.
export const unregisterPush = renterAction({ name: 'renter.push_unregistered', scope: 'view', input: renterInput('unregister-push') }, async (link, input, inLinkShop) => {
  await inLinkShop((transaction) => unregisterRenterPush(transaction, link.rentalId, input.pushToken, new Date()))
  return {}
})
