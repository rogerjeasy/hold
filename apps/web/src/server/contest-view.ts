import 'server-only'
import { contestRecord, latestContestSummary } from '@hold/db'
import type { Transaction } from '@hold/db'
import type { ContestView } from '@/features/contest/contest-summary-panel'

// The contest summary as one reader sees it (architecture.md section 6.15): the person deciding reads the shop's
// version, the renter theirs, both from the same record. Nothing for a claim the renter did not contest.
export async function contestViewFor(transaction: Transaction, rentalId: string, audience: 'shop' | 'renter'): Promise<ContestView | undefined> {
  const record = await contestRecord(transaction, rentalId)
  if (record === undefined) return undefined
  const latest = await latestContestSummary(transaction, record.claimId)
  const version = latest?.summary === null || latest?.summary === undefined ? null : audience === 'shop' ? latest.summary.forShop : latest.summary.forRenter
  return {
    outcome: latest?.outcome ?? 'pending',
    simulated: latest?.simulated ?? false,
    version,
    comment: record.comment,
    lines: record.lines,
    rental: { conditionReply: record.conditionReply, conditionRepliedAt: record.conditionRepliedAt, renterPhotos: record.renterPhotos, incidentsReported: record.incidentsReported },
  }
}
