import { STAFF_ROLES } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { boolean, check, integer, jsonb, pgPolicy, pgTable, text, unique } from 'drizzle-orm/pg-core'
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
    // Whether renters may return an item themselves when nobody is at the counter, and where they leave it, in the
    // shop's words (architecture.md section 6.13). Self-return is never on without a drop point.
    selfReturn: boolean().notNull().default(false),
    dropPoint: text(),
    // When the counter is staffed, the same every day on the shop's clock, as "09:00". Both or neither.
    opensAt: text(),
    closesAt: text(),
    // The most extra days a renter may add from their phone, with nobody to ask (architecture.md section 6.14). Zero
    // turns extensions off.
    extensionMaxDays: integer().notNull().default(7),
    createdAt: createdAt(),
  },
  (table) => [
    check('self_return_has_drop_point', sql`not ${table.selfReturn} or ${table.dropPoint} is not null`),
    check('hours_both_or_neither', sql`(${table.opensAt} is null) = (${table.closesAt} is null)`),
    check('extension_days_allowed', sql`${table.extensionMaxDays} between 0 and 28`),
    shopIsolation(table.id),
  ],
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
