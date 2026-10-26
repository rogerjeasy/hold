import { CLAIM_STATES } from '@hold/domain'
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { priceEntries } from './catalog.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, APPROVAL_DECISIONS, APPROVAL_METHODS, APPROVAL_SUBJECTS, approvalDecision, approvalMethod, approvalSubject, CLAIM_LINE_SOURCES, CLAIM_REPLY_DECISIONS, claimLineSource, claimReplyDecision, claimState } from './enums.ts'
import { findings } from './evidence.ts'
import { incidents } from './incidents.ts'
import { rentals } from './rentals.ts'
import { shopReference, users } from './shops.ts'

export const claims = pgTable(
  'claims',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .unique()
      .references(() => rentals.id),
    currency: currency().notNull(),
    totalCents: cents().notNull().default(0),
    state: claimState().notNull().default('draft'),
    raisedByUserId: reference().references(() => users.id),
    presentedAt: at(),
    replyDueAt: at(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.state, CLAIM_STATES), shopIsolation(table.shopId)],
)

// Each line has a finding with photographs, a named person and their written reason, or the renter's agreement during
// the rental with the photographs they took.
export const claimLines = pgTable(
  'claim_lines',
  {
    id: id(),
    shopId: shopReference(),
    claimId: reference()
      .notNull()
      .references(() => claims.id),
    priceEntryId: reference()
      .notNull()
      .references(() => priceEntries.id),
    currency: currency().notNull(),
    amountCents: cents().notNull(),
    source: claimLineSource().notNull(),
    findingId: reference().references(() => findings.id),
    // The incident whose agreed line this is, for a line the renter agreed during the rental.
    incidentId: reference().references(() => incidents.id),
    addedByUserId: reference().references(() => users.id),
    reason: text(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.source, CLAIM_LINE_SOURCES), shopIsolation(table.shopId)],
)

export const claimReplies = pgTable(
  'claim_replies',
  {
    id: id(),
    shopId: shopReference(),
    claimId: reference()
      .notNull()
      .references(() => claims.id),
    decision: claimReplyDecision().notNull(),
    // The renter's own words. Quoted data, never instructions.
    comment: text(),
    addedPhotoIds: jsonb().$type<readonly string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.decision, CLAIM_REPLY_DECISIONS), shopIsolation(table.shopId)],
)

// What one person decided, and what they changed. Append-only.
export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    shopId: shopReference(),
    subject: approvalSubject().notNull(),
    subjectId: reference().notNull(),
    decidedByUserId: reference().references(() => users.id),
    decision: approvalDecision().notNull(),
    changes: jsonb().$type<readonly Readonly<Record<string, unknown>>[]>().notNull().default([]),
    method: approvalMethod().notNull(),
    mandateId: reference(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.subject, APPROVAL_SUBJECTS), allowed(table.decision, APPROVAL_DECISIONS), allowed(table.method, APPROVAL_METHODS), shopIsolation(table.shopId)],
)
