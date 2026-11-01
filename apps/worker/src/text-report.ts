import { inShop, markTextStatus } from '@hold/db'
import type { Database } from '@hold/db'
import { z } from 'zod'

// A delivery report from AWS End User Messaging's event destination (architecture.md section 12.3). Only the fields
// Hold reads are kept. The context is what Hold sent with the text, so a report without it is not one of Hold's.
export const textReportSchema = z.object({
  eventType: z.string().min(1).max(100),
  eventTimestamp: z.number().int().positive(),
  messageId: z.string().min(1).max(200),
  context: z.object({ shopId: z.uuid(), rentalId: z.uuid() }),
})
export type TextReport = z.infer<typeof textReportSchema>

// The reports that end a text's way: delivered, or never to arrive. The rest, such as queued, say nothing yet.
const FAILED = new Set(['TEXT_BLOCKED', 'TEXT_CARRIER_BLOCKED', 'TEXT_CARRIER_UNREACHABLE', 'TEXT_INVALID', 'TEXT_INVALID_MESSAGE', 'TEXT_SPAM', 'TEXT_TTL_EXPIRED', 'TEXT_UNKNOWN', 'TEXT_UNREACHABLE'])

export async function recordTextReport(database: Database, report: TextReport): Promise<void> {
  const outcome = report.eventType === 'TEXT_DELIVERED' ? { status: 'delivered' as const, failure: null } : FAILED.has(report.eventType) ? { status: 'failed' as const, failure: report.eventType } : undefined
  if (outcome === undefined) return
  // Inside the shop the text carried: a report naming another shop finds no text there.
  await inShop(database, { role: 'hold_worker', shopId: report.context.shopId }, (transaction) => markTextStatus(transaction, report.messageId, outcome, new Date(report.eventTimestamp)))
}
