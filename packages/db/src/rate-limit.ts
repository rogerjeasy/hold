import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

export type RateLimit = { readonly name: string; readonly max: number; readonly windowSeconds: number }

// Counts one request against a limit, for one subject such as an address or a network address, and says whether it
// is still within it. The subject is stored only as a fingerprint.
export async function takeRateToken(database: Database, limit: RateLimit, subject: string): Promise<boolean> {
  return outsideShop(database, (transaction) => takeRateTokenIn(transaction, limit, subject))
}

// The same, inside a transaction the caller has open, as either service.
export async function takeRateTokenIn(transaction: Transaction, limit: RateLimit, subject: string): Promise<boolean> {
  const bucket = createHash('sha256').update(`${limit.name}\u0000${subject.toLowerCase()}`).digest('hex')
  const [row] = await transaction
    .select({ allowed: sql<boolean>`allowed` })
    // The RDS Data API sends a whole number as a bigint, so the function's integer parameters are named.
    .from(sql`hold_take_rate_token(${bucket}, ${limit.max}::integer, ${limit.windowSeconds}::integer) as taken(allowed)`)
  return row?.allowed === true
}
