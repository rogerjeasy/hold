import 'server-only'
import { renterLinkPath } from '@hold/auth'
import { atShopTime } from '@hold/domain'
import type { PlacementStrategy } from '@hold/domain'
import { createBooking } from '@hold/db'
import type { Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
import { list, Refusal } from './action'
import { newRenterLink, renterUrl } from './renter-links'
import { reachRenterIn } from './renter-reach'

// What a booking form sends, from the counter or from the shop's page: a period on the shop's clock and a count of
// each item type. No amount: the fee and the hold come from the item types.
export const bookingFields = {
  startsAt: z.string().max(16),
  endsAt: z.string().max(16),
  itemTypeId: list(z.uuid()),
  count: list(z.string().max(3)),
}

type BookingInput = { readonly startsAt: string; readonly endsAt: string; readonly itemTypeId: readonly string[]; readonly count: readonly string[] }

type Placed = { readonly rentalId: string; readonly token: string; readonly path: string }

export async function placeBooking(
  transaction: Transaction,
  shop: { readonly id: string; readonly timeZone: string },
  input: BookingInput,
  who: { readonly contact: { readonly name: string; readonly email: string } | undefined; readonly language: Locale; readonly bookedThrough: 'staff' | 'shop_page'; readonly placement?: PlacementStrategy },
): Promise<Placed | Refusal> {
  const startsAt = atShopTime(shop.timeZone, input.startsAt)
  const endsAt = atShopTime(shop.timeZone, input.endsAt)
  if (startsAt === undefined || endsAt === undefined) return new Refusal('period_invalid')
  if (input.count.length !== input.itemTypeId.length) return new Refusal('rows_mismatched')
  // A type asked for none is left out, as a form with a counter at zero sends it.
  const lines = input.itemTypeId.map((itemTypeId, index) => ({ itemTypeId, count: Number(input.count[index]) })).filter((line) => line.count !== 0)
  const link = await newRenterLink(endsAt)
  const booked = await createBooking(transaction, shop.id, { startsAt, endsAt, lines, contact: who.contact, language: who.language, bookedThrough: who.bookedThrough, ...(who.placement === undefined ? {} : { placement: who.placement }), link }, new Date())
  if (!booked.ok) return new Refusal(booked.reason === 'not_available' && 'itemTypeId' in booked ? `not_available:${String(input.itemTypeId.indexOf(booked.itemTypeId))}` : booked.reason)
  return { rentalId: booked.rentalId, token: link.token, path: renterLinkPath(link.token, who.language) }
}

// Sends the renter their link, in their language, by text or email as they are reached (architecture.md section 12.3).
// The email goes to the address given at booking, as every link does. Says how it went, or null when it reached
// nobody: the booking still stands, and staff can show the link.
// 'held' when the day's emails are spent: the link was not emailed, and staff show it to the renter instead.
export async function sendRenterLink(transaction: Transaction, rentalId: string, token: string, language: Locale, shopName: string, contactEmail: string | null): Promise<'text' | 'email' | 'held' | null> {
  const emails = await getTranslations({ locale: language, namespace: 'emails.renterLink' })
  const texts = await getTranslations({ locale: language, namespace: 'texts' })
  const link = await renterUrl(token, language)
  const reached = await reachRenterIn(transaction, rentalId, () => ({
    purpose: 'renter_link',
    email: contactEmail === null ? null : { to: contactEmail, subject: emails('subject', { shop: shopName }), text: emails('body', { shop: shopName, link }) },
    text: texts('renterLink', { shop: shopName, link }),
  }))
  if (reached?.emailHeld === true) return 'held'
  return reached === undefined || reached.via === 'none' ? null : reached.via
}
