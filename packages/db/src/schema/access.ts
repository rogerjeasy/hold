import { sql } from 'drizzle-orm'
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// The two roles the services log in as. Neither owns a table, so row-level security applies to both.
// Migrations run as the owner. The roles are created in the first migration, and given a login on deploy.
export const appRole = pgRole('hold_app').existing()
export const workerRole = pgRole('hold_worker').existing()

// Allows a row only inside the shop the transaction is scoped to (architecture.md section 12.2).
// hold_in_scope is defined in the first migration.
export function shopIsolation(shopColumn: AnyPgColumn) {
  const inScope = sql`hold_in_scope(${shopColumn})`
  return pgPolicy('shop_isolation', { for: 'all', to: [appRole, workerRole], using: inScope, withCheck: inScope })
}
