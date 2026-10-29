import { integer, jsonb, pgTable } from 'drizzle-orm/pg-core'
import { shopIsolation } from './access.ts'
import { createdAt, id, reference } from './columns.ts'
import { shopReference, users } from './shops.ts'

// A shop's own insights dashboard (extensions.md section 12.5): AG Studio's state as an owner or manager left it,
// written over on each save. One per shop. The version names the report it was built on, so a dashboard saved before
// the tables changed opens as the first dashboard instead.
export const insightsDashboards = pgTable(
  'insights_dashboards',
  {
    id: id(),
    shopId: shopReference().unique(),
    state: jsonb().$type<Readonly<Record<string, unknown>>>().notNull(),
    reportVersion: integer().notNull(),
    updatedByUserId: reference()
      .notNull()
      .references(() => users.id),
    updatedAt: createdAt(),
  },
  (table) => [shopIsolation(table.shopId)],
)
