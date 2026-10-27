'use server'
import { confirmAgreement, grantShopSettlement, revokeShopSettlement } from '@hold/db'
import { parseAmount } from '@hold/domain'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { sendSettlement } from '@/server/settlement-queue'
import { settlementLimitsInput } from './negotiation-input'

// The shop's side of an advocate (extensions.md section 9.4). Only the owner sets or ends the shop advocate's limits,
// with a passkey; the owner or a manager confirms what the advocates agreed, as for any decision on a contested claim.
// The final tap stays on: waiving it is not offered in this build.

export const saveSettlementLimits = shopAction({ name: 'settlement.limits_saved', roles: ['owner'], needsPasskey: true, input: withLocale(settlementLimitsInput) }, async (context, input, transaction) => {
  const largest = parseAmount(input.largestClaim, context.shop.currency ?? 'XXX')
  if (largest === undefined) return new Refusal('amount_invalid')
  const granted = await grantShopSettlement(transaction, context.person.userId, { lowestSharePercent: input.lowestShare, largestClaimCents: largest.cents, rounds: input.rounds, evidenceRequired: input.evidenceRequired === 'yes', finalTap: true }, input.days, new Date())
  return granted.ok ? { mandateId: granted.mandateId } : new Refusal(granted.reason)
})

export const endSettlementLimits = shopAction({ name: 'settlement.limits_ended', roles: ['owner'], needsPasskey: true, input: withLocale({}) }, async (context, _input, transaction) => {
  const ended = await revokeShopSettlement(transaction, context.person.userId, new Date())
  return ended.ok ? {} : new Refusal(ended.reason)
})

export const confirmSettlementForShop = shopAction({ name: 'settlement.decided', roles: ['owner', 'manager'], needsPasskey: true, input: withLocale({ negotiationId: z.uuid(), decision: z.enum(['confirm', 'decline']) }) }, async (context, input, transaction) => {
  const result = await confirmAgreement(transaction, input.negotiationId, { kind: 'staff', userId: context.person.userId }, input.decision, new Date())
  return result.ok ? result : new Refusal(result.reason)
}, async (context, result) => {
  if (result.executionId !== null) await sendSettlement(context.shop.id, result.rentalId, result.executionId)
})
