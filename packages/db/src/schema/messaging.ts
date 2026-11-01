import { TEXT_PURPOSES, TEXT_STATUSES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { at, createdAt, id, reference } from './columns.ts'
import { allowed, OUTBOX_STATES, outboxState } from './enums.ts'
import { rentals } from './rentals.ts'
import { shopReference } from './shops.ts'

// Only the token's fingerprint is stored, so removing the row ends the link and a leaked table reveals no link.
export const renterLinks = pgTable(
  'renter_links',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    tokenFingerprint: text().notNull().unique(),
    // jsonb, not a text array: the RDS Data API cannot send an array as a parameter.
    scopes: jsonb().$type<readonly string[]>().notNull(),
    expiresAt: at().notNull(),
    lastUsedAt: at(),
    revokedAt: at(),
    claimCodeHash: text(),
    claimCodeExpiresAt: at(),
    claimCodeAttempts: integer().notNull().default(0),
    // A one-time code proving the renter is present before they change their Clean Record (extensions.md section
    // 7.6). Staff can open a view link, so the link alone is not enough.
    trustCodeHash: text(),
    trustCodeExpiresAt: at(),
    trustCodeAttempts: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

// Messages written in the same transaction as the state change they announce (architecture.md section 7.6).
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    shopId: shopReference(),
    queue: text().notNull(),
    // Work is ordered per rental, so two workers never act on the same hold at once.
    messageGroup: text().notNull(),
    payload: jsonb().$type<Readonly<Record<string, unknown>>>().notNull(),
    state: outboxState().notNull().default('pending'),
    createdAt: createdAt(),
    sentAt: at(),
  },
  (table) => [allowed(table.state, OUTBOX_STATES), shopIsolation(table.shopId)],
)

// Who did what, when, from where. Append-only.
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    shopId: shopReference(),
    actorKind: text().notNull(),
    actorId: text(),
    action: text().notNull(),
    subjectKind: text(),
    subjectId: text(),
    detail: jsonb().$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    source: text(),
    at: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)

// Each text sent to a renter (architecture.md section 12.3): what it was for, to which number, and what AWS End User
// Messaging said became of it. A real text's words are never kept, since a code may be in them. A demo shop shows its
// texts on the renter's page instead of sending them, and only those keep their words, so the page can show them.
export const textMessages = pgTable(
  'text_messages',
  {
    id: id(),
    shopId: shopReference(),
    rentalId: reference()
      .notNull()
      .references(() => rentals.id),
    purpose: text().notNull(),
    toPhone: text().notNull(),
    status: text().notNull(),
    providerMessageId: text().unique(),
    body: text(),
    failure: text(),
    createdAt: createdAt(),
    statusAt: at(),
  },
  (table) => [
    allowed(table.purpose, TEXT_PURPOSES),
    allowed(table.status, TEXT_STATUSES),
    check('words_only_when_shown', sql`(${table.status} = 'simulated') = (${table.body} is not null)`),
    shopIsolation(table.shopId),
  ],
)
