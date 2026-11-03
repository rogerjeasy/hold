import { sql } from 'drizzle-orm'
import { outsideShop } from './scope.ts'
import type { Database } from './scope.ts'

export type ExecutionToRecheck = { readonly id: string; readonly shopId: string; readonly rentalId: string }

// The money executions still pending or submitted, untouched since before waitedSince, in every shop, oldest first
// (migration 0047). Each one returned is stamped with now, so it is returned again only after another wait.
export async function executionsToRecheck(database: Database, waitedSince: Date, now: Date, max: number): Promise<readonly ExecutionToRecheck[]> {
  return outsideShop(
    database,
    (transaction) =>
      transaction
        .select({ id: sql<string>`due.id`, shopId: sql<string>`due.shop_id`, rentalId: sql<string>`due.rental_id` })
        .from(sql`hold_executions_to_recheck(${waitedSince.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${max}::integer) as due`),
    'hold_worker',
  )
}
