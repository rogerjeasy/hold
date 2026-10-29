import { keepClaimPromise } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop, sendExecution } from './execution-queue.ts'

// The shop's promise to decide a contested claim (architecture.md section 6.16). Sent when the renter contests, and
// again by its schedule at the date: an undecided claim then goes to the owner, or is waived under the owner's rule
// and its hold released. The owners are told either way.
export async function runClaimPromise(dependencies: SettleDependencies, message: { readonly shopId: string; readonly claimId: string }) {
  const now = dependencies.now()
  const kept = await inWorkerShop(dependencies, message.shopId, (transaction) => keepClaimPromise(transaction, message.claimId, now))
  if (kept.outcome === 'not_due') {
    const name = `claim-promise-${message.claimId}`
    await dependencies.scheduler.at(name, kept.decideBy, { queue: 'upkeep', group: kept.rentalId, deduplicationId: name, body: { shopId: message.shopId, claimId: message.claimId, kind: 'claim_promise' } })
    return 'promise_scheduled' as const
  }
  if (kept.outcome === 'escalated') {
    await dependencies.notifier.tell({ kind: 'promise_missed', shopId: message.shopId, rentalId: kept.rentalId, waived: false })
    return 'promise_missed' as const
  }
  if (kept.outcome === 'waived') {
    if (kept.executionId !== null) await sendExecution(dependencies, message.shopId, kept.rentalId, kept.executionId)
    await dependencies.notifier.tell({ kind: 'promise_missed', shopId: message.shopId, rentalId: kept.rentalId, waived: true })
    return 'promise_waived' as const
  }
  return 'nothing_to_do' as const
}
