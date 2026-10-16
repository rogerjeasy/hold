import { HOLD_STATES, RENTAL_STATES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Accessory } from '@hold/domain'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { items, priceLists, wearPolicies } from './catalog.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, AUTHORIZATION_STATES, authorizationState, BOOKING_CHANNELS, bookingChannel, holdState, PLACEMENT_STRATEGIES, placementStrategy, rentalState } from './enums.ts'
import { shopReference } from './shops.ts'

// A renter is the PayPal payer who approved an order. Not tied to one shop, so it has no shop_id.
// Renters are created and found through hold_renter_for_payer, defined in the first migration.
export const renters = pgTable(
  'renters',
  {
    id: id(),
    paypalPayerId: text().notNull().unique(),
    email: text().notNull(),
    name: text(),
    language: text().notNull().default('en'),
    createdAt: createdAt(),
  },
  (table) => [
    // A shop sees only the renters who rented from it.
    pgPolicy('renter_of_shop', {
      for: 'select',
      to: [appRole, workerRole],
      using: sql`exists (select 1 from rentals where rentals.renter_id = ${table.id})`,
    }),
  ],
)

export const rentals = pgTable(
  'rentals',
  {
    id: id(),
    shopId: shopReference(),
    // Unknown until PayPal says who paid the fee.
    renterId: reference().references(() => renters.id),
    startsAt: at().notNull(),
    endsAt: at().notNull(),
    currency: currency().notNull(),
    feeCents: cents().notNull(),
    // The hold the renter agreed to at booking, placed at pickup: each item's hold, read from its type.
    holdCents: cents().notNull(),
    // Whom staff booked for, so the link can be sent. The renter is who PayPal says paid, set in renterId.
    contactName: text(),
    contactEmail: text(),
    // The renter's language, for the link and its emails.
    language: text().notNull().default('en'),
    bookedThrough: bookingChannel().notNull().default('staff'),
    priceListId: reference()
      .notNull()
      .references(() => priceLists.id),
    wearPolicyId: reference()
      .notNull()
      .references(() => wearPolicies.id),
    state: rentalState().notNull().default('pending_payment'),
    paypalFeeOrderId: text().unique(),
    // Sample data added for a demonstration. Its hold, claim and money rows are simulated too, and every screen says so.
    simulated: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.state, RENTAL_STATES), allowed(table.bookedThrough, BOOKING_CHANNELS), shopIsolation(table.shopId)],
)

export const rentalItems = pgTable(
  'rental_items',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    itemId: reference()
      .notNull()
      .references(() => items.id),
    // The item's day rate and hold as the renter agreed them at booking, whatever its type says later.
    dayRateCents: cents().notNull(),
    holdCents: cents().notNull(),
    accessoriesOut: jsonb().$type<readonly Accessory[]>().notNull().default([]),
    accessoriesBack: jsonb().$type<readonly Accessory[]>(),
  },
  (table) => [unique().on(table.rentalId, table.itemId), shopIsolation(table.shopId)],
)

export const holds = pgTable(
  'holds',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .unique()
      .references(() => rentals.id),
    currency: currency().notNull(),
    reservedCents: cents().notNull(),
    strategy: placementStrategy().notNull(),
    state: holdState().notNull().default('requested'),
    paypalOrderId: text().unique(),
    currentAuthorizationId: reference().references((): AnyPgColumn => authorizations.id),
    // The order of a replacement hold the renter is asked to approve before this one ends (architecture.md 7.4).
    replacementOrderId: text().unique(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.strategy, PLACEMENT_STRATEGIES), allowed(table.state, HOLD_STATES), shopIsolation(table.shopId)],
)

// One PayPal authorization behind a hold. A renewal adds a new one, which names the one it renewed; a replacement, a new
// hold the renter approved before the old one ended, names the one it replaced.
export const authorizations = pgTable(
  'authorizations',
  {
    id: id(),
    shopId: shopReference(),
    holdId: reference()
      .notNull()
      .references(() => holds.id),
    paypalAuthorizationId: text().notNull().unique(),
    currency: currency().notNull(),
    amountCents: cents().notNull(),
    // Both clocks come from PayPal's reply, not from Hold's clock.
    createdAt: at().notNull(),
    assuredUntil: at().notNull(),
    validUntil: at().notNull(),
    state: authorizationState().notNull().default('created'),
    renewedFromId: reference().references((): AnyPgColumn => authorizations.id),
    replacesId: reference().references((): AnyPgColumn => authorizations.id),
  },
  (table) => [allowed(table.state, AUTHORIZATION_STATES), shopIsolation(table.shopId)],
)
