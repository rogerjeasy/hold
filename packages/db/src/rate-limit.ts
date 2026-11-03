import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

export type RateLimit = { readonly name: string; readonly max: number; readonly windowSeconds: number }

// The row a limit keeps for one subject. The subject is stored only as a fingerprint.
const bucketOf = (limit: RateLimit, subject: string) => createHash('sha256').update(`${limit.name}\u0000${subject.toLowerCase()}`).digest('hex')

// Counts one request against a limit, for one subject such as an address or a network address, and says whether it
// is still within it.
export async function takeRateToken(database: Database, limit: RateLimit, subject: string): Promise<boolean> {
  return outsideShop(database, (transaction) => takeRateTokenIn(transaction, limit, subject))
}

// The same, inside a transaction the caller has open, as either service.
export async function takeRateTokenIn(transaction: Transaction, limit: RateLimit, subject: string): Promise<boolean> {
  const [row] = await transaction
    .select({ allowed: sql<boolean>`allowed` })
    // The RDS Data API sends a whole number as a bigint, so the function's integer parameters are named.
    .from(sql`hold_take_rate_token(${bucketOf(limit, subject)}, ${limit.max}::integer, ${limit.windowSeconds}::integer) as taken(allowed)`)
  return row?.allowed === true
}

// How many requests a subject may still make within a limit, read without counting one, so a screen can say so.
export async function rateTokensLeft(database: Database, limit: RateLimit, subject: string): Promise<number> {
  const [row] = await outsideShop(database, (transaction) => transaction
    .select({ left: sql<number>`left_count` })
    .from(sql`hold_rate_tokens_left(${bucketOf(limit, subject)}, ${limit.max}::integer, ${limit.windowSeconds}::integer) as tokens(left_count)`))
  // The RDS Data API may answer an integer as text.
  return Number(row?.left ?? 0)
}
