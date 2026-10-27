import { auditLog, finishProposal, inShop, proposalToCarryOut } from '@hold/db'
import type { Database } from '@hold/db'

export type CarryOutDependencies = {
  readonly database: Database
  readonly now: () => Date
  // Emails the renter of the rental the shop's approved message. False when it could not be sent.
  readonly message: (input: { readonly shopId: string; readonly rentalId: string; readonly text: string }) => Promise<boolean>
  // Sends the shop's approved answer on a PayPal dispute. False when PayPal refused it.
  readonly answerDispute: (shopId: string, input: { readonly disputeId: string; readonly message: string; readonly idempotencyKey: string }) => Promise<boolean>
}

export type CarryOutOutcome = 'executed' | 'failed' | 'nothing_to_do'

// Sends what a person approved from the morning queue: a message to the renter, or the shop's answer to PayPal on a
// dispute (extensions.md section 6.3, step 6). Neither moves money. The text is the draft the person read, which passed
// the number guard when it was written.
export async function carryOutProposal(dependencies: CarryOutDependencies, input: { readonly shopId: string; readonly proposalId: string }): Promise<CarryOutOutcome> {
  const asWorker = <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(dependencies.database, { role: 'hold_worker', shopId: input.shopId }, work)
  const proposal = await asWorker((transaction) => proposalToCarryOut(transaction, input.proposalId))
  if (proposal === undefined || proposal.draft === null) return 'nothing_to_do'
  const { draft } = proposal
  let done = false
  if (proposal.kind === 'send_message' && proposal.rentalId !== null) done = await dependencies.message({ shopId: input.shopId, rentalId: proposal.rentalId, text: draft })
  if (proposal.kind === 'respond_to_dispute' && proposal.subjectKind === 'dispute') done = await dependencies.answerDispute(input.shopId, { disputeId: proposal.subjectId, message: draft, idempotencyKey: `proposal-${proposal.id}` })
  const outcome = done ? 'executed' : 'failed'
  const now = dependencies.now()
  await asWorker(async (transaction) => {
    await finishProposal(transaction, proposal.id, outcome, now)
    await transaction.insert(auditLog).values({ shopId: input.shopId, actorKind: 'system', actorId: 'operations_worker', action: `proposal.${outcome}`, subjectKind: 'proposal', subjectId: proposal.id, detail: { kind: proposal.kind }, at: now })
  })
  return outcome
}
