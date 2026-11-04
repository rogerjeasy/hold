import { sql } from 'drizzle-orm'
import { bigint, char, check, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// Shared column builders. Column names follow the snake_case casing set on every Drizzle instance.

export const id = () => uuid().primaryKey().defaultRandom()

// Amounts are integer cents. A bigint read as a JavaScript number is exact up to 2^53, far above any deposit.
export const cents = () => bigint({ mode: 'number' })

// The database's own guard that an amount is never negative (migration 0050, added NOT VALID by hand).
export const nonNegative = (column: AnyPgColumn) => check(`${column.name}_non_negative`, sql`${column} >= 0`)

export const currency = () => char({ length: 3 })

export const at = () => timestamp({ withTimezone: true, mode: 'date' })

export const createdAt = () => at().notNull().defaultNow()

// A reference to another row's id.
export const reference = () => uuid()
