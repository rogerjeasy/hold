import { REPAIR_OUTCOMES, REPAIR_STATES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { items } from './catalog.ts'
import { claimLines, claims } from './claims.ts'
import { at, cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed } from './enums.ts'
import { captureSessions, marks } from './evidence.ts'
import { rentalItems } from './rentals.ts'
import { shopReference, users } from './shops.ts'

// Repair closes the loop (architecture.md section 9.6): one per item a charged claim names, or one staff open from the
// item's open marks. Its photographs are a capture session of kind repair, on the rental item it belongs to: the
// claim's, or the item's latest. Once done it never changes. The cost is the shop's own record; no money moves.
export const repairs = pgTable(
  'repairs',
  {
    id: id(),
    shopId: shopReference(),
    itemId: reference()
      .notNull()
      .references(() => items.id),
    claimId: reference().references(() => claims.id),
    rentalItemId: reference()
      .notNull()
      .references(() => rentalItems.id),
    state: text().notNull().default('open'),
    sessionId: reference().references(() => captureSessions.id),
    currency: currency().notNull(),
    costCents: cents(),
    note: text(),
    // Nobody when a charge opened it.
    openedByUserId: reference().references(() => users.id),
    closedByUserId: reference().references(() => users.id),
    closedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [
    allowed(table.state, REPAIR_STATES),
    check('done_is_costed', sql`(${table.state} = 'done') = (${table.closedAt} is not null and ${table.costCents} is not null and ${table.closedByUserId} is not null)`),
    check('cost_not_negative', sql`${table.costCents} is null or ${table.costCents} >= 0`),
    uniqueIndex('repairs_claim_item').on(table.claimId, table.itemId).where(sql`${table.claimId} is not null`),
    shopIsolation(table.shopId),
  ],
)

// What a repair covers: a known mark, a line of the claim that opened it, or both. A line with no mark (a person's
// written line with no region) has nothing to photograph.
export const repairLines = pgTable(
  'repair_lines',
  {
    id: id(),
    shopId: shopReference(),
    repairId: reference()
      .notNull()
      .references(() => repairs.id),
    markId: reference().references(() => marks.id),
    claimLineId: reference().references(() => claimLines.id),
    description: text().notNull(),
    claimedCents: cents(),
    outcome: text(),
    // The order the lines were written in: the claim's, or the marks chosen.
    position: integer().notNull(),
    createdAt: createdAt(),
  },
  (table) => [check('outcome_allowed', sql`${table.outcome} is null or ${table.outcome} in (${sql.raw(REPAIR_OUTCOMES.map((outcome) => `'${outcome}'`).join(', '))})`), shopIsolation(table.shopId)],
)
