import { ESCALATION_REASONS, MOVE_KINDS, NEGOTIATION_KINDS, NEGOTIATION_SIDES, NEGOTIATION_STATES, PASS_REASONS } from '@hold/domain'
import type { Offer, OfferLine } from '@hold/domain'
import { boolean, integer, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { claims } from './claims.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, escalationReason, moveKind, negotiationKind, negotiationSide, negotiationState, passReason } from './enums.ts'
import { mandates } from './operations.ts'
import { rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// One negotiation per claim, ever (extensions.md section 9.7, X4.7): the unique claim keeps a claim that failed to
// settle from being negotiated again, so nobody can probe the other side's limit by trying several times.
export const negotiations = pgTable(
  'negotiations',
  {
    id: id(),
    shopId: shopReference(),
    claimId: reference()
      .notNull()
      .unique()
      .references(() => claims.id),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    kind: negotiationKind().notNull(),
    state: negotiationState().notNull().default('open'),
    // The mandates the advocates act under. A reply, written when only the renter has an advocate, has no shop mandate.
    shopMandateId: reference().references(() => mandates.id),
    renterMandateId: reference()
      .notNull()
      .references(() => mandates.id),
    currency: currency().notNull(),
    // The claim's lines at their published prices when the negotiation opened.
    claimTotalCents: cents().notNull(),
    // The most offers each side may make, and when the negotiation ends without agreement.
    roundLimit: integer().notNull(),
    deadline: at().notNull(),
    // Refusals in a row for each side. Two are a pass.
    shopRefusals: integer().notNull().default(0),
    renterRefusals: integer().notNull().default(0),
    // The fingerprint of the last move: the transcript's head.
    headFingerprint: text(),
    agreed: jsonb().$type<Offer>(),
    endedReason: escalationReason(),
    shopConfirmedByUserId: reference().references(() => users.id),
    shopConfirmedAt: at(),
    renterConfirmedAt: at(),
    // The advocates were the test environment's stand-ins, not Claude. Shown on every screen and in the record.
    simulated: boolean().notNull().default(false),
    openedAt: at().notNull(),
    endedAt: at(),
    updatedAt: at().notNull(),
  },
  (table) => [allowed(table.kind, NEGOTIATION_KINDS), allowed(table.state, NEGOTIATION_STATES), allowed(table.endedReason, ESCALATION_REASONS), shopIsolation(table.shopId)],
)

// Each move the referee accepted, in order, chained to the one before by its fingerprint so the transcript can be
// neither reordered nor trimmed. Append-only. A refused move is not a move: it is counted on the negotiation and
// written to the audit trail, and only its own side hears why. No words an advocate wrote are kept: what crosses to the
// other side is the line amounts, their grounds and the ids of the records they cite, and screens word them from fixed
// templates, so no limit can travel in free text (security review of extensions.md section 9.13).
export const negotiationMoves = pgTable(
  'negotiation_moves',
  {
    id: id(),
    shopId: shopReference(),
    negotiationId: reference()
      .notNull()
      .references(() => negotiations.id),
    sequence: integer().notNull(),
    side: negotiationSide().notNull(),
    kind: moveKind().notNull(),
    // A full list of line amounts with their grounds and the evidence they cite. Empty for an acceptance or a pass.
    lines: jsonb().$type<readonly OfferLine[]>().notNull().default([]),
    totalCents: cents(),
    passReason: passReason(),
    // Who moved: an advocate run by Hold, a renter's own assistant, or the referee opening with the claim.
    actor: text().notNull(),
    model: text(),
    promptVersion: text(),
    previousFingerprint: text(),
    fingerprint: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.side, NEGOTIATION_SIDES), allowed(table.kind, MOVE_KINDS), allowed(table.passReason, PASS_REASONS), unique().on(table.negotiationId, table.sequence), unique().on(table.fingerprint), shopIsolation(table.shopId)],
)
