import { and, eq, gte, sql } from 'drizzle-orm'
import { auditLog, insightsDashboards } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// A shop's own insights dashboard (extensions.md section 12.5), read and saved inside the shop alone.

export type SavedInsightsDashboard = { readonly state: Readonly<Record<string, unknown>>; readonly reportVersion: number; readonly updatedAt: Date }

export async function savedInsightsDashboard(transaction: Transaction): Promise<SavedInsightsDashboard | undefined> {
  const [row] = await transaction.select({ state: insightsDashboards.state, reportVersion: insightsDashboards.reportVersion, updatedAt: insightsDashboards.updatedAt }).from(insightsDashboards)
  return row
}

// Writes over the shop's dashboard, or saves its first.
export async function saveInsightsDashboard(transaction: Transaction, save: { readonly shopId: string; readonly userId: string; readonly state: Readonly<Record<string, unknown>>; readonly reportVersion: number; readonly at: Date }): Promise<void> {
  const values = { state: save.state, reportVersion: save.reportVersion, updatedByUserId: save.userId, updatedAt: save.at }
  await transaction.insert(insightsDashboards).values({ shopId: save.shopId, ...values }).onConflictDoUpdate({ target: insightsDashboards.shopId, set: values })
}

// The tokens the shop's insights agent has spent since a time, from each turn's own audit line.
export async function insightsTokensSince(transaction: Transaction, since: Date): Promise<number> {
  const [row] = await transaction
    .select({ tokens: sql<number>`coalesce(sum((${auditLog.detail}->>'tokens')::int), 0)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'insights.turn'), gte(auditLog.at, since)))
  return row?.tokens ?? 0
}
