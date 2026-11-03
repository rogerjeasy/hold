import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { auditLog, shops } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database } from './scope.ts'

// A judge's demo is retired a week after it opened (architecture.md section 20.3). The worker's daily cleanup finds
// the demos due, removes their accounts from the user pool, then marks each shop retired. Nothing is deleted: the shop
// keeps every rental, money event and audit line, and is then found nowhere a live demo shows (migration 0044).

export type DueDemoSession = { readonly shopId: string; readonly emails: readonly string[] }

// The demos opened before the cutoff and not yet retired, with the addresses of the people who work in them.
export async function demoSessionsDue(database: Database, cutoff: Date): Promise<readonly DueDemoSession[]> {
  const rows = await outsideShop(
    database,
    (transaction) => transaction.select({ shopId: sql<string>`due.shop_id`, email: sql<string | null>`due.email` }).from(sql`hold_demo_sessions_due(${cutoff.toISOString()}::timestamptz) as due`),
    'hold_worker',
  )
  const due = new Map<string, string[]>()
  for (const row of rows) {
    const emails = due.get(row.shopId) ?? []
    if (row.email !== null) emails.push(row.email)
    due.set(row.shopId, emails)
  }
  return [...due].map(([shopId, emails]) => ({ shopId, emails }))
}

// Marks one demo retired, as the worker, in that shop alone, with an audit line. Only a demo opened before the cutoff
// and not yet retired is marked; anything else is left as it is and the answer is false.
export function retireDemoSession(database: Database, input: { readonly shopId: string; readonly cutoff: Date; readonly now: Date }): Promise<boolean> {
  return inShop(database, { role: 'hold_worker', shopId: input.shopId }, async (transaction) => {
    const retired = await transaction
      .update(shops)
      .set({ retiredAt: input.now })
      .where(and(eq(shops.id, input.shopId), eq(shops.demoSession, true), isNull(shops.retiredAt), lt(shops.createdAt, input.cutoff)))
      .returning({ id: shops.id })
    if (retired.length === 0) return false
    await transaction.insert(auditLog).values({ shopId: input.shopId, actorKind: 'system', action: 'demo.retired', subjectKind: 'shop', subjectId: input.shopId, detail: { simulated: true }, at: input.now })
    return true
  })
}

// Whether a shop is a demo still in its week, for the browser that started it: only then is it offered again.
export async function demoSessionLive(database: Database, shopId: string): Promise<boolean> {
  const [shop] = await inShop(database, { role: 'hold_app', shopId }, (transaction) =>
    transaction.select({ demoSession: shops.demoSession, retiredAt: shops.retiredAt }).from(shops).where(eq(shops.id, shopId)),
  )
  return shop !== undefined && shop.demoSession && shop.retiredAt === null
}
