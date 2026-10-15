import 'server-only'
import { atShopTime } from '@hold/domain'
import { createBooking } from '@hold/db'
import type { Transaction } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
import { list, Refusal } from './action'
import { newRenterLink, renterPath, renterUrl } from './renter-links'
import { getServices } from './services'

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
  who: { readonly contact: { readonly name: string; readonly email: string } | undefined; readonly language: Locale; readonly bookedThrough: 'staff' | 'shop_page' },
): Promise<Placed | Refusal> {
  const startsAt = atShopTime(shop.timeZone, input.startsAt)
  const endsAt = atShopTime(shop.timeZone, input.endsAt)
  if (startsAt === undefined || endsAt === undefined) return new Refusal('period_invalid')
  if (input.count.length !== input.itemTypeId.length) return new Refusal('rows_mismatched')
  // A type asked for none is left out, as a form with a counter at zero sends it.
  const lines = input.itemTypeId.map((itemTypeId, index) => ({ itemTypeId, count: Number(input.count[index]) })).filter((line) => line.count !== 0)
  const link = await newRenterLink(endsAt)
  const booked = await createBooking(transaction, shop.id, { startsAt, endsAt, lines, contact: who.contact, language: who.language, bookedThrough: who.bookedThrough, link }, new Date())
  if (!booked.ok) return new Refusal(booked.reason === 'not_available' && 'itemTypeId' in booked ? `not_available:${String(input.itemTypeId.indexOf(booked.itemTypeId))}` : booked.reason)
  return { rentalId: booked.rentalId, token: link.token, path: renterPath(link.token, who.language) }
}

// Sends the renter their link, in their language. Without the email the booking still stands: staff can show the link.
export async function emailRenterLink(to: string, token: string, language: Locale, shopName: string): Promise<boolean> {
  const { mailer } = await getServices()
  const t = await getTranslations({ locale: language, namespace: 'emails.renterLink' })
  return mailer.send({ to, subject: t('subject', { shop: shopName }), text: t('body', { shop: shopName, link: await renterUrl(token, language) }) })
}
