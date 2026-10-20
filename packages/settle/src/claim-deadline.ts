import { claimDeadlineWork, claimDue, resolveClaimSettlement } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import { inWorkerShop, sendExecution } from './execution-queue.ts'
export async function runClaimDeadline(dependencies: SettleDependencies, message: { readonly kind: 'claim_plan' | 'claim_due'; readonly shopId: string; readonly claimId: string }) {
  const work = await inWorkerShop(dependencies, message.shopId, (transaction) => claimDeadlineWork(transaction, message.claimId))
  if (work === undefined) return 'nothing_to_do' as const
  if (['charging', 'charged', 'charge_failed'].includes(work.claim.state) && work.claim.replyDueAt !== null && work.claim.replyDueAt > dependencies.now()) {
    const name = `claim-reply-close-${message.claimId}`
    await dependencies.scheduler.at(name, work.claim.replyDueAt, { queue: 'upkeep', group: work.claim.rentalId, deduplicationId: name, body: { shopId: message.shopId, claimId: message.claimId, kind: 'claim_due' } })
  }
  if (work.claim.state !== 'presented') {
    const nextId = await inWorkerShop(dependencies, message.shopId, (transaction) => resolveClaimSettlement(transaction, message.claimId, dependencies.now()))
    if (nextId !== undefined) await sendExecution(dependencies, message.shopId, work.claim.rentalId, nextId)
    return 'nothing_to_do' as const
  }
  if (work.at > dependencies.now()) {
    const name = `claim-due-${message.claimId}`
    await dependencies.scheduler.at(name, work.at, { queue: 'upkeep', group: work.claim.rentalId, deduplicationId: name, body: { shopId: message.shopId, claimId: message.claimId, kind: 'claim_due' } })
    return 'claim_scheduled' as const
  }
  const begun = await inWorkerShop(dependencies, message.shopId, (transaction) => claimDue(transaction, message.claimId, dependencies.now()))
  if (!begun.ok) return 'nothing_to_do' as const
  if (work.claim.replyDueAt !== null && work.claim.replyDueAt > dependencies.now()) {
    const name = `claim-reply-close-${message.claimId}`
    await dependencies.scheduler.at(name, work.claim.replyDueAt, { queue: 'upkeep', group: work.claim.rentalId, deduplicationId: name, body: { shopId: message.shopId, claimId: message.claimId, kind: 'claim_due' } })
  }
  await sendExecution(dependencies, message.shopId, begun.rentalId, begun.executionId)
  return 'claim_charging' as const
}
