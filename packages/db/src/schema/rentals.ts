import { HOLD_STATES, RENTAL_STATES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { items, priceLists, wearPolicies } from './catalog.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, AUTHORIZATION_STATES, authorizationState, holdState, PLACEMENT_STRATEGIES, placementStrategy, rentalState } from './enums.ts'
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
    priceListId: reference()
      .notNull()
      .references(() => priceLists.id),
    wearPolicyId: reference()
      .notNull()
      .references(() => wearPolicies.id),
    state: rentalState().notNull().default('pending_payment'),
    paypalFeeOrderId: text().unique(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.state, RENTAL_STATES), shopIsolation(table.shopId)],
)

export type Accessory = { readonly name: string; readonly count: number }

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
    createdAt: createdAt(),
  },
  (table) => [allowed(table.strategy, PLACEMENT_STRATEGIES), allowed(table.state, HOLD_STATES), shopIsolation(table.shopId)],
)

// One PayPal authorization behind a hold. A renewal adds a new one, which names the one it replaced.
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
  },
  (table) => [allowed(table.state, AUTHORIZATION_STATES), shopIsolation(table.shopId)],
)
