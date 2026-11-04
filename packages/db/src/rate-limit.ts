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
  return outsideShop(database, (transaction) => rateTokensLeftIn(transaction, limit, subject))
}

// The same, inside a transaction the caller has open, so a caller can check several limits before taking any.
export async function rateTokensLeftIn(transaction: Transaction, limit: RateLimit, subject: string): Promise<number> {
  const [row] = await transaction
    .select({ left: sql<number | string>`left_count` })
    .from(sql`hold_rate_tokens_left(${bucketOf(limit, subject)}, ${limit.max}::integer, ${limit.windowSeconds}::integer) as tokens(left_count)`)
  // The RDS Data API may answer an integer as text.
  return Number(row?.left ?? 0)
}

// Gives back a token taken in the current window, for work that turned out not to be what the limit counts.
export async function returnRateToken(database: Database, limit: RateLimit, subject: string): Promise<void> {
  await outsideShop(database, (transaction) => transaction.execute(sql`select hold_return_rate_token(${bucketOf(limit, subject)})`))
}

// Removes the rows of windows long over, as the worker, the only role allowed to, and says how many went.
export async function pruneRateLimits(database: Database): Promise<number> {
  const [row] = await outsideShop(database, (transaction) => transaction.select({ pruned: sql<number | string>`pruned` }).from(sql`hold_prune_rate_limits() as removed(pruned)`), 'hold_worker')
  // The RDS Data API may answer an integer as text.
  return Number(row?.pruned ?? 0)
}
