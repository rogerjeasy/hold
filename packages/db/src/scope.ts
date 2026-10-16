import { sql } from 'drizzle-orm'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import type * as schema from './schema/index.ts'

type Schema = typeof schema

// Any Drizzle PostgreSQL database with Hold's schema: the Data API deployed, a local driver in development and tests.
export type Database = PgDatabase<PgQueryResultHKT, Schema>
export type Transaction = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

export const DATABASE_ROLES = ['hold_app', 'hold_worker'] as const
export type DatabaseRole = (typeof DATABASE_ROLES)[number]

// Who a transaction acts for. The handler wrapper has already checked that the caller may act in this shop.
export type Scope = {
  readonly role: DatabaseRole
  readonly shopId: string
  // The person signed in. Absent for a renter link or a worker job, which are bound to the shop already.
  readonly userId?: string
}

// Opens a transaction in which row-level security sees only the scope's shop. Every setting ends with the transaction.
// The role is set even where the connection already logs in as it, so a local owner connection behaves the same.
export function inShop<Result>(database: Database, scope: Scope, work: (transaction: Transaction) => Promise<Result>): Promise<Result> {
  if (!DATABASE_ROLES.includes(scope.role)) {
    throw new RangeError(`Unknown database role ${scope.role}.`)
  }
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('role', ${scope.role}, true), set_config('hold.shop_id', ${scope.shopId}, true), set_config('hold.user_id', ${scope.userId ?? ''}, true)`,
    )
    return work(transaction)
  })
}

// A transaction that names no shop, so row-level security shows it nothing. It can only call the functions that
// answer before a shop is chosen, such as finding which shops a signed-in person belongs to.
export function outsideShop<Result>(database: Database, work: (transaction: Transaction) => Promise<Result>, role: DatabaseRole = 'hold_app'): Promise<Result> {
  if (!DATABASE_ROLES.includes(role)) throw new RangeError(`Unknown database role ${role}.`)
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('role', ${role}, true)`)
    return work(transaction)
  })
}
