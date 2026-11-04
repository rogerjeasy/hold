import { CONTACT_CHANNELS, EXTENSION_STATES, HOLD_STATES, RENTAL_ENDED_STATES, RENTAL_STATES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, check, integer, jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Accessory } from '@hold/domain'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { items, priceLists, wearPolicies } from './catalog.ts'
import { at, cents, createdAt, currency, id, nonNegative, reference } from './columns.ts'
import { allowed, AUTHORIZATION_STATES, authorizationState, BOOKING_CHANNELS, bookingChannel, CONDITION_REPLIES, conditionReply, extensionState, holdState, PLACEMENT_STRATEGIES, placementStrategy, rentalState } from './enums.ts'
import { shopReference, users } from './shops.ts'
import { trustLadders } from './trust.ts'

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
    // The renter key (extensions.md section 7.4), kept so the rental's outcome can be written when it closes without
    // Hold's secret. Set through hold_set_renter_trust_key, once.
    trustKey: text().unique(),
    createdAt: createdAt(),
  },
  (table) => [
    // A shop sees only the renters who rented from it, and no longer one whose details it erased (section 15.2).
    pgPolicy('renter_of_shop', {
      for: 'select',
      to: [appRole, workerRole],
      using: sql`exists (select 1 from rentals where rentals.renter_id = ${table.id} and rentals.renter_erased_at is null)`,
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
    // How the renter is reached (architecture.md section 12.3): by email, or by text. Links and notices go to the phone
    // as given; a one-time code only once the renter confirmed it with the code in phoneCodeHash.
    contactChannel: text().notNull().default('email'),
    contactPhone: text(),
    phoneConfirmedAt: at(),
    phoneCodeHash: text(),
    phoneCodeExpiresAt: at(),
    phoneCodeAttempts: integer().notNull().default(0),
    // When the email PayPal gave was told which number texts go to. Null until it is, and again for each new number.
    phonePayerToldAt: at(),
    bookedThrough: bookingChannel().notNull().default('staff'),
    priceListId: reference()
      .notNull()
      .references(() => priceLists.id),
    wearPolicyId: reference()
      .notNull()
      .references(() => wearPolicies.id),
    state: rentalState().notNull().default('pending_payment'),
    paypalFeeOrderId: text().unique(),
    // The renter's answer to the condition report sent at handover, and when they gave it (architecture.md 11.2).
    conditionReply: conditionReply(),
    conditionRepliedAt: at(),
    // When the renter sent their own return and left the item at the drop point (architecture.md section 6.13). The
    // return counts from then. A person who then could not find it says so, once, and when.
    droppedOffAt: at(),
    dropOffMissingAt: at(),
    dropOffMissingByUserId: reference().references(() => users.id),
    // Sample data added for a demonstration. Its hold, claim and money rows are simulated too, and every screen says so.
    simulated: boolean().notNull().default(false),
    // The trust ladder version and rung its hold was placed under, as it keeps the price list version. Null when the
    // ordinary hold applied with no ladder published.
    trustLadderId: reference().references((): AnyPgColumn => trustLadders.id),
    trustRung: integer(),
    // When the owner erased the renter's personal details on this ended rental, on their request (architecture.md
    // section 15.2). A trigger keeps it, and the details it replaced, from changing again.
    renterErasedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [
    allowed(table.state, RENTAL_STATES),
    check('erased_only_when_ended', sql`${table.renterErasedAt} is null or ${table.state} in (${sql.raw(RENTAL_ENDED_STATES.map((state) => `'${state}'`).join(', '))})`),
    allowed(table.bookedThrough, BOOKING_CHANNELS),
    allowed(table.conditionReply, CONDITION_REPLIES),
    allowed(table.contactChannel, CONTACT_CHANNELS),
    check('texts_need_a_phone', sql`${table.contactChannel} = 'email' or ${table.contactPhone} is not null`),
    check('confirmed_phone_exists', sql`${table.phoneConfirmedAt} is null or ${table.contactPhone} is not null`),
    shopIsolation(table.shopId),
  ],
)

// More days a renter asked for from their own phone or assistant (architecture.md section 6.14): the end it moves from
// and to, the extra days and their fee as plain code priced them, and the PayPal order the person approves. The fee is
// the extension's own, never taken from the hold.
export const rentalExtensions = pgTable(
  'rental_extensions',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    fromEndsAt: at().notNull(),
    toEndsAt: at().notNull(),
    extraDays: integer().notNull(),
    amountCents: cents().notNull(),
    currency: currency().notNull(),
    state: extensionState().notNull().default('quoted'),
    paypalOrderId: text().unique(),
    // Who asked: the renter on their link, or their own assistant through Hold's MCP server.
    askedThrough: text().notNull(),
    createdAt: createdAt(),
    paidAt: at(),
    // Money PayPal moved that Hold did not apply as the quote (section 6.14): a capture of another amount, or one PayPal
    // completed after Hold stopped waiting. The amount and capture are PayPal's, kept for the person who checks it.
    attention: text(),
    attentionAt: at(),
    capturedCents: cents(),
    paypalCaptureId: text(),
    checkedAt: at(),
    checkedByUserId: reference().references(() => users.id),
  },
  (table) => [
    allowed(table.state, EXTENSION_STATES),
    check('asked_through_allowed', sql`${table.askedThrough} in ('link', 'assistant')`),
    check('later_end', sql`${table.toEndsAt} > ${table.fromEndsAt}`),
    check('attention_allowed', sql`${table.attention} is null or ${table.attention} in ('amount_mismatch', 'paid_after_expiry')`),
    shopIsolation(table.shopId),
  ],
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
    // Kept by a trigger whenever the state changes, so a detector can tell how long a hold has been at risk.
    stateChangedAt: createdAt(),
    // The hold the renter agreed to at booking. reservedCents is lower when the shop's trust ladder lowered it, and
    // never higher. Null for holds asked for before the ladder existed, whose reserved amount was the ordinary one.
    ordinaryCents: cents(),
    trustLadderId: reference().references((): AnyPgColumn => trustLadders.id),
    trustRung: integer(),
    // The clean returns the reduction rested on, for the sentence the renter reads.
    cleanReturns: integer(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.strategy, PLACEMENT_STRATEGIES), allowed(table.state, HOLD_STATES), nonNegative(table.reservedCents), nonNegative(table.ordinaryCents), shopIsolation(table.shopId)],
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
