'use server'

import { confirmRule as confirmOwnerRule, decideProposal, decideRule, draftRule, grantStandingRule as grantMandate, liveStandingRule, pendingProposals, queueOperationsCheck, revokeMandate, rulesForOwner } from '@hold/db'
import { mayApproveTogether, parseAmount, proposalMovesMoney } from '@hold/domain'
import { z } from 'zod'
import { sendWrittenAt } from '@/server/outbox-send'
import { list, Refusal, shopAction, withLocale } from '@/server/shop-access'
import type { ShopContext } from '@/server/shop-access'

// Every server function of the morning queue (extensions.md section 6.3, steps 5 and 6, and section 6.5). Each is built
// by shopAction, which checks who is asking and their role before the work below runs. A test checks that this file
// exports nothing else. Nothing here takes an amount but the owner's own rule threshold, and nothing here charges.

const DECIDERS = ['owner', 'manager'] as const
const OWNER = ['owner'] as const
const proposal = withLocale({ proposalId: z.uuid() })

// What one change wrote to the outbox goes to its queue at once, after the commit; the relay sends whatever fails.
const handOn = async (context: ShopContext, output: { readonly at: Date }) => sendWrittenAt(context.shop.id, output.at)

type Outcome = { readonly proposalId: string; readonly ok: true; readonly state: string } | { readonly proposalId: string; readonly ok: false; readonly reason: string }

// One entry, or several releases together, approved by a person on screen; never under a mandate. What moves money
// needs the passkey, checked here on the server. A proposal whose records changed is kept as superseded; any other
// refusal leaves everything as it was.
export const approveProposals = shopAction({ name: 'proposal.approved', roles: DECIDERS, needsPasskey: false, input: withLocale({ proposalId: list(z.uuid()) }) }, async (context, input, transaction) => {
  const ids = [...new Set(input.proposalId)]
  if (ids.length === 0) return new Refusal('none_chosen')
  const kinds = (await pendingProposals(transaction, ids)).map((each) => each.kind)
  if (ids.length > 1 && !mayApproveTogether(kinds)) return new Refusal('not_together')
  if (kinds.some(proposalMovesMoney) && context.passkeyNeeded) return new Refusal('passkey_needed')
  const at = new Date()
  const outcomes: Outcome[] = []
  for (const proposalId of ids) {
    const decided = await decideProposal(transaction, proposalId, context.person.userId, { decision: 'approve', reason: '' }, at)
    outcomes.push(decided.ok ? { proposalId, ok: true, state: decided.state } : { proposalId, ok: false, reason: decided.reason })
  }
  const kept = outcomes.some((outcome) => outcome.ok || outcome.reason === 'superseded')
  const [first] = outcomes
  if (!kept && first !== undefined && !first.ok) return new Refusal(first.reason)
  return { outcomes, at }
}, handOn)

// A rejection needs a reason, and drafts a rule from it in plain code: do not propose this kind. The owner confirms
// it, perhaps as "below an amount", or discards it (section 6.5).
export const rejectProposal = shopAction({ name: 'proposal.rejected', roles: DECIDERS, needsPasskey: false, input: withLocale({ proposalId: z.uuid(), reason: z.string().trim().min(1).max(500) }) }, async (context, input, transaction) => {
  const [pending] = await pendingProposals(transaction, [input.proposalId])
  const now = new Date()
  const decided = await decideProposal(transaction, input.proposalId, context.person.userId, { decision: 'reject', reason: input.reason }, now)
  if (!decided.ok) return new Refusal(decided.reason)
  if (pending === undefined) return new Refusal('not_pending')
  return { ruleId: await draftRule(transaction, { kind: 'never', proposalKind: pending.kind }, input.proposalId, now) }
})

// Put off until tomorrow; it comes back to the queue then.
export const postponeProposal = shopAction({ name: 'proposal.postponed', roles: DECIDERS, needsPasskey: false, input: proposal }, async (context, input, transaction) => {
  const decided = await decideProposal(transaction, input.proposalId, context.person.userId, { decision: 'postpone', reason: '' }, new Date())
  return decided.ok ? { proposalId: input.proposalId } : new Refusal(decided.reason)
})

// A run now, as the nightly schedule makes one: written to the outbox for the ops-agent queue, ordered per shop.
export const checkNow = shopAction({ name: 'operations.check_requested', roles: DECIDERS, needsPasskey: false, input: withLocale({}), rateLimit: { name: 'operations-check-now', max: 12, windowSeconds: 600 } }, async (_context, _input, transaction) => {
  const at = new Date()
  await queueOperationsCheck(transaction, at)
  return { at }
}, handOn)

// The owner confirms a drafted rule as it is or below an amount they set, which starts from the proposal's amount.
export const confirmRule = shopAction({ name: 'operations.rule_confirmed', roles: OWNER, needsPasskey: false, input: withLocale({ ruleId: z.uuid(), shape: z.enum(['never', 'below_amount']), amount: z.string().max(20) }) }, async (context, input, transaction) => {
  const drafted = (await rulesForOwner(transaction)).find((rule) => rule.id === input.ruleId && rule.state === 'drafted')
  if (drafted === undefined) return new Refusal('rule_not_open')
  const { proposalKind } = drafted.rule
  let rule: Parameters<typeof confirmOwnerRule>[3] = { kind: 'never', proposalKind }
  if (input.shape === 'below_amount') {
    const amount = parseAmount(input.amount, context.shop.currency ?? 'EUR')
    if (amount === undefined || amount.cents <= 0) return new Refusal('amount_invalid')
    rule = { kind: 'below_amount', proposalKind, cents: amount.cents }
  }
  return (await confirmOwnerRule(transaction, input.ruleId, context.person.userId, rule, new Date())) ? { ruleId: input.ruleId } : new Refusal('rule_not_open')
})

// A drafted rule, or one already confirmed: it leaves the list and the agent's memory.
export const discardRule = shopAction({ name: 'operations.rule_discarded', roles: OWNER, needsPasskey: false, input: withLocale({ ruleId: z.uuid() }) }, async (context, input, transaction) =>
  (await decideRule(transaction, input.ruleId, context.person.userId, 'discard', new Date())) ? { ruleId: input.ruleId } : new Refusal('rule_not_open'),
)

// The one standing rule offered (section 6.4): release a clean return nobody confirmed in time. The owner turns it on
// with a passkey, within a daily count and a number of days; turning it on again replaces the live one.
export const grantStandingRule = shopAction({ name: 'operations.standing_rule_granted', roles: OWNER, needsPasskey: true, input: withLocale({ dailyCount: z.coerce.number().int().min(1).max(20), days: z.coerce.number().int().min(1).max(90) }) }, async (context, input, transaction) => {
  const now = new Date()
  const live = await liveStandingRule(transaction, now)
  if (live !== undefined) await revokeMandate(transaction, live.id, now)
  return { mandateId: await grantMandate(transaction, context.person.userId, { dailyCount: input.dailyCount, days: input.days }, now) }
})

// Turning it off is never held back by a missing passkey.
export const revokeStandingRule = shopAction({ name: 'operations.standing_rule_revoked', roles: OWNER, needsPasskey: false, input: withLocale({}) }, async (_context, _input, transaction) => {
  const now = new Date()
  const live = await liveStandingRule(transaction, now)
  if (live === undefined) return new Refusal('standing_rule_off')
  await revokeMandate(transaction, live.id, now)
  return { mandateId: live.id }
})
