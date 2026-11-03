'use server'
import { confirmAgreement, grantShopSettlement, openSampleAdvocates, revokeShopSettlement, takeRateTokenIn } from '@hold/db'
import { parseAmount, utcDay } from '@hold/domain'
import { z } from 'zod'
import { Refusal, shopAction, withLocale } from '@/server/shop-access'
import { writeContestSummary } from '@/server/contest-summary'
import { sendNegotiation } from '@/server/negotiation-queue'
import { callerNetwork } from '@/server/network'
import { getServices } from '@/server/services'
import { sendSettlement } from '@/server/settlement-queue'
import { SAMPLE_ADVOCATE_LIMITS } from './limits'
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

// Hands the demo's sample claim that waits for a reply to the two advocates (extensions.md section 9), as the owner
// or a manager would decide a contested claim. No passkey: nothing here moves money, and what a sample's advocates
// agree can never be confirmed into a capture. Only a sample: the repository refuses a real renter's claim.
type SampleOpened = { readonly kind: 'negotiation' | 'reply'; readonly rentalId: string; readonly negotiationId: string; readonly outboxId: string }
export const argueSampleClaim = shopAction({ name: 'settlement.sample_argued', roles: ['owner', 'manager'], needsPasskey: false, input: withLocale({ rentalId: z.uuid() }) }, async (_context, input, transaction): Promise<SampleOpened | Refusal> => {
  const { config } = await getServices()
  // Taken in this transaction: no model is called in it, so a refused or failed opening rolls back and spends nothing.
  if (!(await takeRateTokenIn(transaction, SAMPLE_ADVOCATE_LIMITS.perNetwork, (await callerNetwork()) ?? 'unknown'))) return new Refusal('daily_cap')
  if (!(await takeRateTokenIn(transaction, SAMPLE_ADVOCATE_LIMITS.perDay, utcDay(new Date())))) return new Refusal('daily_cap')
  const opened = await openSampleAdvocates(transaction, input.rentalId, { simulated: config.services === 'fake' }, new Date())
  return opened.ok ? { kind: opened.kind, rentalId: opened.rentalId, negotiationId: opened.negotiationId, outboxId: opened.outboxId } : new Refusal(opened.reason)
}, async (context, result: SampleOpened) => {
  try { await sendNegotiation(context.shop.id, result.rentalId, result.negotiationId, result.outboxId) } catch { /* The committed outbox retries delivery. */ }
  await writeContestSummary(context.shop.id, result.rentalId)
})
