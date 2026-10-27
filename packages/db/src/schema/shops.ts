import { STAFF_ROLES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { appRole, shopIsolation, workerRole } from './access.ts'
import { cents, createdAt, currency, id, reference } from './columns.ts'
import { allowed, PAYPAL_MODES, paypalMode, staffRole } from './enums.ts'

// A person who signs in to Hold. Not tied to one shop, so it has no shop_id.
// People are created and found through hold_register_user and hold_shops_of_subject, defined in a migration.
export const users = pgTable(
  'users',
  {
    id: id(),
    cognitoSubject: text().notNull().unique(),
    email: text().notNull(),
    name: text(),
    language: text().notNull().default('en'),
    createdAt: createdAt(),
  },
  (table) => [
    // A person sees themselves and the people they work with in the current shop.
    pgPolicy('self_or_colleague', {
      for: 'select',
      to: [appRole, workerRole],
      using: sql`${table.id} = hold_scope_user() or exists (select 1 from staff_roles where staff_roles.user_id = ${table.id} and staff_roles.shop_id = hold_scope_shop())`,
    }),
    pgPolicy('self_update', { for: 'update', to: appRole, using: sql`${table.id} = hold_scope_user()` }),
  ],
)

export const shops = pgTable(
  'shops',
  {
    id: id(),
    name: text().notNull(),
    // The shop's own address for renters, /s/{slug}. Made from its name when it is created, and numbered if taken.
    slug: text().notNull().unique(),
    timeZone: text().notNull(),
    // Both are set when the owner writes the first price list, not at sign-up.
    currency: currency(),
    // A claim above this goes to the owner or a manager, whatever a staff member's own limit. Unset, staff limits alone apply.
    ownerApprovalThresholdCents: cents(),
    replyPeriodHours: integer().notNull().default(72),
    // How long the operations agent waits before it asks about a clean return, an unpaid invoice or a waiting
    // incident, and which automatic reminders the shop has switched off (extensions.md section 6.4).
    opsSettings: jsonb().$type<{ readonly confirmCleanWithinHours?: number; readonly invoiceUnpaidDays?: number; readonly incidentWaitHours?: number; readonly remindersOff?: readonly string[] }>().notNull().default({}),
    // A shop one judge's demo session opened (architecture.md section 20.3). Never listed for renters' assistants.
    demoSession: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [shopIsolation(table.id)],
)

// Every shop's row carries this. It is what row-level security checks.
export const shopReference = () =>
  reference()
    .notNull()
    .references(() => shops.id)

export const staffRoles = pgTable(
  'staff_roles',
  {
    id: id(),
    shopId: shopReference(),
    userId: reference()
      .notNull()
      .references(() => users.id),
    role: staffRole().notNull(),
    approvalLimitCents: cents().notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.role, STAFF_ROLES), unique().on(table.shopId, table.userId), shopIsolation(table.shopId)],
)

export const paypalAccounts = pgTable(
  'paypal_accounts',
  {
    id: id(),
    shopId: shopReference(),
    merchantId: text(),
    // The name of the Secrets Manager secret that holds the API credentials. Never the credentials.
    credentialReference: text().notNull(),
    webhookId: text(),
    mode: paypalMode().notNull(),
    createdAt: createdAt(),
  },
  (table) => [allowed(table.mode, PAYPAL_MODES), unique().on(table.shopId, table.mode), shopIsolation(table.shopId)],
)
