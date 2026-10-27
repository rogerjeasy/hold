import { CLAIM_REPLY_DECISIONS } from './enums.ts'
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { priceLists, wearPolicies } from './catalog.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { rentals } from './rentals.ts'
import { shopReference } from './shops.ts'

// Renting through the renter's own assistant (extensions.md section 8). Every amount here was priced by Hold from the
// shop's item types; no assistant ever sends one.

export type QuoteLine = { readonly itemTypeId: string; readonly count: number; readonly dayRateCents: number; readonly holdCents: number }

// A price Hold gave an assistant for a period and a count of each item type. A booking is made from it once, before
// it expires, and only while the shop's prices are still the ones it was priced on.
export const quotes = pgTable(
  'quotes',
  {
    id: id(),
    shopId: shopReference(),
    startsAt: at().notNull(),
    endsAt: at().notNull(),
    currency: currency().notNull(),
    feeCents: cents().notNull(),
    holdCents: cents().notNull(),
    lines: jsonb().$type<readonly QuoteLine[]>().notNull(),
    priceListId: reference()
      .notNull()
      .references(() => priceLists.id),
    wearPolicyId: reference()
      .notNull()
      .references(() => wearPolicies.id),
    expiresAt: at().notNull(),
    // The booking made from it. Set once.
    rentalId: reference()
      .unique()
      .references(() => rentals.id),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

export type DraftReply = { readonly decision: (typeof CLAIM_REPLY_DECISIONS)[number]; readonly comment: string }

// The assistant that booked a rental. It holds the booking secret's fingerprint from the start, and the agent token's
// once PayPal's capture of the fee is on record. Only fingerprints are kept, so the table reveals neither.
export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .unique()
      .references(() => rentals.id),
    bookingSecretFingerprint: text().notNull().unique(),
    tokenFingerprint: text().unique(),
    scopes: jsonb().$type<readonly string[]>().notNull().default([]),
    // The name the client declared when it connected. Shown to the renter as not verified.
    clientLabel: text().notNull(),
    tokenIssuedAt: at(),
    expiresAt: at(),
    lastUsedAt: at(),
    revokedAt: at(),
    // A reply to a claim the assistant prepared, for the person to read. The assistant's words, kept as data.
    draftReply: jsonb().$type<DraftReply>(),
    draftedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)
