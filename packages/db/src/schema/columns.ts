import { bigint, char, timestamp, uuid } from 'drizzle-orm/pg-core'

// Shared column builders. Column names follow the snake_case casing set on every Drizzle instance.

export const id = () => uuid().primaryKey().defaultRandom()

// Amounts are integer cents. A bigint read as a JavaScript number is exact up to 2^53, far above any deposit.
export const cents = () => bigint({ mode: 'number' })

export const currency = () => char({ length: 3 })

export const at = () => timestamp({ withTimezone: true, mode: 'date' })

export const createdAt = () => at().notNull().defaultNow()

// A reference to another row's id.
export const reference = () => uuid()
