import { STAFF_ROLES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { integer, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { at, cents, createdAt, id, reference } from './columns.ts'
import { allowed, staffRole } from './enums.ts'
import { shopReference, users } from './shops.ts'

// An owner's or manager's invitation for one person to work at the shop. Only the token's fingerprint is stored.
// The invited person proves the address is theirs with a code before the role is created.
export const staffInvitations = pgTable(
  'staff_invitations',
  {
    id: id(),
    shopId: shopReference(),
    email: text().notNull(),
    role: staffRole().notNull(),
    approvalLimitCents: cents().notNull().default(0),
    language: text().notNull().default('en'),
    invitedByUserId: reference()
      .notNull()
      .references(() => users.id),
    tokenFingerprint: text().notNull().unique(),
    expiresAt: at().notNull(),
    acceptedAt: at(),
    acceptedByUserId: reference().references(() => users.id),
    revokedAt: at(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.role, STAFF_ROLES), shopIsolation(table.shopId)],
)

// Counts of recent requests, keyed by a fingerprint of what is limited, such as an address or a network address.
// Holds nothing that names a person. Reached only through hold_take_rate_token.
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text().primaryKey(),
    windowStartsAt: at().notNull(),
    count: integer().notNull(),
  },
  () => [pgPolicy('through_function_only', { for: 'all', to: [appRole, workerRole], using: sql`false`, withCheck: sql`false` })],
)
