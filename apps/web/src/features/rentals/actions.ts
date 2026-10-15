'use server'

import { abandonBooking, BOOKING_LINK_SCOPES, findPayPalAccount, issueRenterLink, rentalDetail } from '@hold/db'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { bookingFields, emailRenterLink, placeBooking } from '@/server/booking'
import { qrSvg } from '@/server/qr'
import { newRenterLink, renterUrl } from '@/server/renter-links'
import { getServices } from '@/server/services'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'

// Every server function that books or changes a rental from the shop's side. Each is built by shopAction, which
// checks who is asking and their role before the work below runs, and writes the audit line after it. A test checks
// that this file exports nothing else. Booking moves no money, so no passkey is asked for.

const STAFF = ['owner', 'manager', 'counter_staff'] as const

export const bookRental = shopAction(
  {
    name: 'rental.booked',
    roles: STAFF,
    needsPasskey: false,
    input: withLocale({
      ...bookingFields,
      contactName: z.string().trim().max(120).default(''),
      contactEmail: z.union([z.email().max(254), z.literal('')]).default(''),
      language: z.string().max(5),
    }),
  },
  async (context, input, transaction) => {
    const { config } = await getServices()
    // The renter pays the fee into the shop's own PayPal account, so there must be one.
    if ((await findPayPalAccount(transaction, context.shop.id, config.paypalMode)) === undefined) return new Refusal('paypal_not_connected')
    const language = readLocale(input.language)
    const name = input.contactName.trim()
    const contact = name === '' && input.contactEmail === '' ? undefined : { name, email: input.contactEmail }
    const placed = await placeBooking(transaction, context.shop, input, { contact, language, bookedThrough: 'staff' })
    if (placed instanceof Refusal) return placed
    const emailed = input.contactEmail === '' ? false : await emailRenterLink(input.contactEmail, placed.token, language, context.shop.name)
    return { rentalId: placed.rentalId, emailed }
  },
)

// A new link to the rental, for the renter to scan at the counter. Earlier links keep working.
export const showRenterLink = shopAction(
  { name: 'rental.link_shown', roles: STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) },
  async (context, input, transaction) => {
    const rental = await rentalDetail(transaction, input.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    const link = await newRenterLink(rental.endsAt)
    await issueRenterLink(transaction, context.shop.id, rental.id, link, BOOKING_LINK_SCOPES)
    const url = await renterUrl(link.token, readLocale(rental.language))
    return { url, qr: await qrSvg(url) }
  },
)

export const emailRenterLinkAgain = shopAction(
  { name: 'rental.link_emailed', roles: STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) },
  async (context, input, transaction) => {
    const rental = await rentalDetail(transaction, input.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    if (rental.contactEmail === null) return new Refusal('no_email')
    const link = await newRenterLink(rental.endsAt)
    await issueRenterLink(transaction, context.shop.id, rental.id, link, BOOKING_LINK_SCOPES)
    const sent = await emailRenterLink(rental.contactEmail, link.token, readLocale(rental.language), context.shop.name)
    return sent ? { email: rental.contactEmail } : new Refusal('email_failed')
  },
)

// Lets go of a booking whose fee was never paid. A paid booking would need its fee refunded, which this does not do.
export const letGoOfBooking = shopAction(
  { name: 'rental.let_go', roles: STAFF, needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) },
  async (_context, input, transaction) => {
    const abandoned = await abandonBooking(transaction, input.rentalId)
    return abandoned.ok ? {} : new Refusal(abandoned.reason)
  },
)
