import { ITEM_CATEGORIES, STORED_OUTCOMES, TRUST_HISTORIES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, CONSENT_PURPOSES, consentPurpose, itemCategory, storedOutcome, trustHistory } from './enums.ts'
import { rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// The Clean Record and the trust ladder (extensions.md section 7). Trust records carry the renter key, a keyed hash
// of the PayPal payer ID, never the payer ID itself, a name, an email or an amount.

// A ladder version is published whole and never changed: a rental keeps the version it was held under. The service
// roles may not update it (migration 0021).
export const trustLadders = pgTable(
  'trust_ladders',
  {
    id: id(),
    shopId: shopReference(),
    version: integer().notNull(),
    currency: currency().notNull(),
    history: trustHistory().notNull(),
    windowMonths: integer().notNull(),
    // A rental below these does not build a record.
    minimumFeeCents: cents().notNull(),
    minimumHours: integer().notNull(),
    publishedByUserId: reference()
      .notNull()
      .references(() => users.id),
    publishedAt: at().notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.history, TRUST_HISTORIES), unique().on(table.shopId, table.version), shopIsolation(table.shopId)],
)

export const trustRungs = pgTable(
  'trust_rungs',
  {
    id: id(),
    shopId: shopReference(),
    ladderId: reference()
      .notNull()
      .references(() => trustLadders.id),
    // Rung 1 first. Rung 0, the ordinary hold, is not stored.
    position: integer().notNull(),
    cleanReturns: integer().notNull(),
    sharePercent: integer().notNull(),
    // Null covers an item of any value.
    largestValueCents: cents(),
    needsSavedMethod: boolean().notNull().default(false),
  },
  (table) => [unique().on(table.ladderId, table.position), shopIsolation(table.shopId)],
)

// One per rental, written in the transaction that closes it, or as `open` when an invoice for its claim is sent.
export const rentalOutcomes = pgTable(
  'rental_outcomes',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .unique()
      .references(() => rentals.id),
    renterKey: text().notNull(),
    // The kind of the rental's most valuable item.
    itemCategory: itemCategory().notNull(),
    closedAt: at().notNull(),
    outcome: storedOutcome().notNull(),
    // Whether it builds a record: fee captured through PayPal, at or above the shop's minimum fee and length.
    counts: boolean().notNull(),
    // An open outcome's invoice falls due then, and counts as unpaid after.
    unpaidAfter: at(),
  },
  (table) => [allowed(table.outcome, STORED_OUTCOMES), allowed(table.itemCategory, ITEM_CATEGORIES), index('rental_outcomes_renter_key').on(table.renterKey), shopIsolation(table.shopId)],
)

// A renter's consent to their record being used at other Hold shops. Not tied to one shop, so it has no shop_id. No
// service role reads or writes it directly: the functions in migration 0021 do, for a renter acting through a link.
export const renterConsents = pgTable(
  'renter_consents',
  {
    id: id(),
    renterKey: text().notNull(),
    purpose: consentPurpose().notNull(),
    // When the renter answered the question. Asked once: a row means it was answered.
    answeredAt: at().notNull(),
    // Null while the renter has not consented.
    consentedAt: at(),
    withdrawnAt: at(),
  },
  (table) => [
    allowed(table.purpose, CONSENT_PURPOSES),
    unique().on(table.renterKey, table.purpose),
    pgPolicy('no_direct_access', { for: 'all', to: [appRole, workerRole], using: sql`false`, withCheck: sql`false` }),
  ],
)
