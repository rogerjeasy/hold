import 'server-only'
import { summarizeContest } from '@hold/compare'
import { contestRecord, inShop, recordContestSummary } from '@hold/db'
import { getServices } from './services'

// Writes the neutral summary of a contest (architecture.md section 6.15) once the contest is committed: one bounded
// model call, outside any transaction, then the checked answer is stored. Any failure leaves the claim page with the
// layout and the facts code built, and the owner may ask for it again. Nothing here decides or moves anything.
export async function writeContestSummary(shopId: string, rentalId: string): Promise<void> {
  try {
    const { database, contestModel } = await getServices()
    const scope = { role: 'hold_app', shopId } as const
    const record = await inShop(database, scope, (transaction) => contestRecord(transaction, rentalId))
    if (record === undefined) return
    const stored = await summarizeContest(record, contestModel)
    await inShop(database, scope, (transaction) => recordContestSummary(transaction, record.claimId, stored, new Date()))
  } catch {
    // The contest is recorded whatever happens here.
  }
}
