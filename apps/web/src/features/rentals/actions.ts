'use server'

import { abandonBooking, askForHold as askForRentalHold, BOOKING_LINK_SCOPES, findPayPalAccount, issueRenterLink, rentalDetail, renterContact, renterTrustKey } from '@hold/db'
import { maskedPhone, phoneNumber, textAllowed } from '@hold/domain'
import { rentalInput } from '@hold/mobile-api'
import { trustedHold } from '@hold/trust'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { bookingFields, placeBooking, sendRenterLink } from '@/server/booking'
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
      // A renter with only a phone at the counter gets their link and everything after by text (architecture.md 12.3).
      contactPhone: z.string().trim().max(40).default(''),
      language: z.string().max(5),
      // A walk-in who approves the fee and the hold at once (architecture.md section 8.2), for a rental starting today.
      walkIn: z.literal('on').optional(),
    }),
  },
  async (context, input, transaction) => {
    const { config } = await getServices()
    // The renter pays the fee into the shop's own PayPal account, so there must be one.
    if ((await findPayPalAccount(transaction, context.shop.id, config.paypalMode)) === undefined) return new Refusal('paypal_not_connected')
    const language = readLocale(input.language)
    const name = input.contactName.trim()
    const phone = input.contactPhone === '' ? undefined : phoneNumber(input.contactPhone)
    if (input.contactPhone !== '' && phone === undefined) return new Refusal('phone_invalid')
    if (phone !== undefined && !textAllowed(phone)) return new Refusal('country_not_texted')
    const contact = name === '' && input.contactEmail === '' && phone === undefined ? undefined : { name, email: input.contactEmail, ...(phone === undefined ? {} : { phone }) }
    const placed = await placeBooking(transaction, context.shop, input, { contact, language, bookedThrough: 'staff', placement: input.walkIn === 'on' ? 'combined' : 'at_counter' })
    if (placed instanceof Refusal) return placed
    return { rentalId: placed.rentalId, sent: await sendRenterLink(transaction, placed.rentalId, placed.token, language, context.shop.name, input.contactEmail === '' ? null : input.contactEmail) }
  },
)

// A new link to the rental, for the renter to scan at the counter. Earlier links keep working.
export const showRenterLink = shopAction(
  { name: 'rental.link_shown', roles: STAFF, needsPasskey: false, input: rentalInput },
  async (context, input, transaction) => {
    const rental = await rentalDetail(transaction, input.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    const link = await newRenterLink(rental.endsAt)
    await issueRenterLink(transaction, context.shop.id, rental.id, link, BOOKING_LINK_SCOPES)
    const url = await renterUrl(link.token, readLocale(rental.language))
    return { url, qr: await qrSvg(url) }
  },
)

// A new link sent the way the renter is reached: by text to their phone, or by email.
export const sendRenterLinkAgain = shopAction(
  { name: 'rental.link_sent', roles: STAFF, needsPasskey: false, input: rentalInput },
  async (context, input, transaction) => {
    const rental = await rentalDetail(transaction, input.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    const contact = await renterContact(transaction, rental.id)
    if (contact === undefined || (rental.contactEmail === null && contact.channel === 'email')) return new Refusal('no_email')
    const link = await newRenterLink(rental.endsAt)
    await issueRenterLink(transaction, context.shop.id, rental.id, link, BOOKING_LINK_SCOPES)
    const sent = await sendRenterLink(transaction, rental.id, link.token, readLocale(rental.language), context.shop.name, rental.contactEmail)
    if (sent === null) return new Refusal('email_failed')
    return { via: sent, to: sent === 'text' && contact.phone !== null ? maskedPhone(contact.phone) : (rental.contactEmail ?? '') }
  },
)

// At pickup: the hold the renter agreed to is requested, lowered by the shop's trust ladder when the renter's record
// earns it, and a new link opens the page where they approve it in PayPal on their own phone. The payer is known from
// the fee they paid. Asked again, it shows a new code for the same hold. Requesting moves no money.
export const askForHold = shopAction(
  { name: 'rental.hold_asked', roles: STAFF, needsPasskey: false, input: rentalInput },
  async (context, input, transaction) => {
    const rental = await rentalDetail(transaction, input.rentalId, new Date())
    if (rental === undefined) return new Refusal('not_found')
    const { trust } = await getServices()
    const renterKey = await renterTrustKey(transaction, rental.id, trust.renterKey)
    const asked = await askForRentalHold(transaction, rental.id, new Date(), await trustedHold(transaction, rental.id, renterKey, new Date()))
    if (!asked.ok) return new Refusal(asked.reason)
    const link = await newRenterLink(rental.endsAt)
    await issueRenterLink(transaction, context.shop.id, rental.id, link, BOOKING_LINK_SCOPES)
    const url = `${await renterUrl(link.token, readLocale(rental.language))}/pay`
    return { url, qr: await qrSvg(url) }
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
