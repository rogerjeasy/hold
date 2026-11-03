import { paymentDeadline, paymentLapsed, rentalDays } from '@hold/domain'
import type { ContactChannel, PriceCategory, RentalState } from '@hold/domain'
import { asc, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { readJson } from './read-json.ts'
import { holds, itemTypes, items, priceEntries, rentalItems, rentals, renters, shops, wearPolicies } from './schema/index.ts'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

// What a renter's link opens (architecture.md section 12.3). The link is found by its fingerprint before any shop is
// chosen; the rental is then read inside the link's shop, with no person named.

export type RenterLink = {
  readonly id: string
  readonly shopId: string
  readonly rentalId: string
  readonly scopes: readonly string[]
  readonly expiresAt: Date
  readonly revokedAt: Date | null
}

export async function findRenterLink(database: Database, fingerprint: string): Promise<RenterLink | undefined> {
  const [link] = await outsideShop(database, (transaction) =>
    transaction
      .select({
        id: sql<string>`link.id`,
        shopId: sql<string>`link.shop_id`,
        rentalId: sql<string>`link.rental_id`,
        scopes: sql<unknown>`link.scopes`,
        expiresAt: sql<string>`link.expires_at`,
        revokedAt: sql<string | null>`link.revoked_at`,
      })
      .from(sql`hold_renter_link(${fingerprint}) as link`),
  )
  if (link === undefined) return undefined
  // Read through a function, so the times arrive as text.
  return { ...link, scopes: readJson(z.array(z.string()), link.scopes), expiresAt: new Date(link.expiresAt), revokedAt: link.revokedAt === null ? null : new Date(link.revokedAt) }
}

export type RenterView = {
  readonly rentalId: string
  readonly shopName: string
  readonly timeZone: string
  readonly state: RentalState
  readonly startsAt: Date
  readonly endsAt: Date
  readonly days: number
  readonly currency: string
  readonly feeCents: number
  readonly holdCents: number
  readonly lines: readonly { readonly name: string; readonly count: number; readonly dayRateCents: number; readonly holdCents: number }[]
  readonly prices: readonly { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }[]
  readonly wearPolicy: string
  readonly replyPeriodHours: number
  readonly renterName: string | null
  readonly simulated: boolean
  readonly paymentLapsed: boolean
  // While the fee is unpaid and not yet lapsed, the moment the booking stops keeping its items; otherwise null.
  readonly paymentKeptUntil: Date | null
  readonly feeOrderId: string | null
  // A walk-in staff let approve the fee and the hold together, in one order (architecture.md section 8.2).
  readonly walkIn: boolean
}

// The rental as its renter sees it: what they rent, the fee, the hold, and the prices and wear policy they agree to.
export async function renterView(transaction: Transaction, rentalId: string, now: Date): Promise<RenterView | undefined> {
  const [rental] = await transaction
    .select({
      id: rentals.id,
      shopName: shops.name,
      timeZone: shops.timeZone,
      replyPeriodHours: shops.replyPeriodHours,
      state: rentals.state,
      startsAt: rentals.startsAt,
      endsAt: rentals.endsAt,
      currency: rentals.currency,
      feeCents: rentals.feeCents,
      holdCents: rentals.holdCents,
      priceListId: rentals.priceListId,
      wearPolicy: wearPolicies.rules,
      renterName: renters.name,
      simulated: rentals.simulated,
      createdAt: rentals.createdAt,
      feeOrderId: rentals.paypalFeeOrderId,
      holdStrategy: holds.strategy,
    })
    .from(rentals)
    .innerJoin(shops, eq(shops.id, rentals.shopId))
    .innerJoin(wearPolicies, eq(wearPolicies.id, rentals.wearPolicyId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .leftJoin(holds, eq(holds.rentalId, rentals.id))
    .where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const lines = await transaction
    .select({ name: itemTypes.name, count: count(rentalItems.id), dayRateCents: rentalItems.dayRateCents, holdCents: rentalItems.holdCents })
    .from(rentalItems)
    .innerJoin(items, eq(items.id, rentalItems.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(eq(rentalItems.rentalId, rentalId))
    .groupBy(itemTypes.name, rentalItems.dayRateCents, rentalItems.holdCents)
    .orderBy(asc(itemTypes.name))
  const prices = await transaction
    .select({ description: priceEntries.description, category: priceEntries.category, amountCents: priceEntries.amountCents })
    .from(priceEntries)
    .where(eq(priceEntries.priceListId, rental.priceListId))
    .orderBy(asc(priceEntries.position))
  return {
    rentalId: rental.id,
    shopName: rental.shopName,
    timeZone: rental.timeZone,
    replyPeriodHours: rental.replyPeriodHours,
    state: rental.state,
    startsAt: rental.startsAt,
    endsAt: rental.endsAt,
    currency: rental.currency,
    feeCents: rental.feeCents,
    holdCents: rental.holdCents,
    wearPolicy: rental.wearPolicy,
    renterName: rental.renterName,
    simulated: rental.simulated,
    feeOrderId: rental.feeOrderId,
    walkIn: rental.holdStrategy === 'combined',
    days: rentalDays(rental.startsAt, rental.endsAt),
    lines,
    prices,
    paymentLapsed: rental.state === 'pending_payment' && paymentLapsed(rental.createdAt, now),
    paymentKeptUntil: rental.state === 'pending_payment' && !paymentLapsed(rental.createdAt, now) ? paymentDeadline(rental.createdAt) : null,
  }
}

// Where to reach a rental's renter: the email PayPal gave when they paid, or the one staff typed, in the rental's
// language. Nothing when neither is known.
// How to reach the renter of a rental: the email PayPal gave for the payer, or the booking's own before anyone paid if any,
// their language, and the phone they chose texts on, if they did (architecture.md section 12.3).
// Simulated: a demo shop, or a sample rental, shows its texts on the renter's page and never sends them.
export type RenterContact = { readonly shopId: string; readonly email: string | null; readonly language: string; readonly channel: ContactChannel; readonly phone: string | null; readonly phoneConfirmed: boolean; readonly simulated: boolean }

export async function renterContact(transaction: Transaction, rentalId: string): Promise<RenterContact | undefined> {
  const [row] = await transaction
    .select({ shopId: rentals.shopId, paid: renters.email, typed: rentals.contactEmail, language: rentals.language, channel: rentals.contactChannel, phone: rentals.contactPhone, confirmedAt: rentals.phoneConfirmedAt, sample: rentals.simulated, demo: shops.demoSession })
    .from(rentals)
    .innerJoin(shops, eq(shops.id, rentals.shopId))
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .where(eq(rentals.id, rentalId))
  const email = row?.paid ?? row?.typed ?? null
  // A renter who gave only a phone is reached by text.
  return row === undefined || (email === null && row.phone === null) ? undefined : { shopId: row.shopId, email, language: row.language, channel: row.channel === 'text' ? 'text' : 'email', phone: row.phone, phoneConfirmed: row.confirmedAt !== null, simulated: row.sample || row.demo }
}
