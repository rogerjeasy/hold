import type { ProposalKind } from './proposal.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'

// Who acts (extensions.md section 4.1). An agent always names the person it acts for.
export const ACTOR_KINDS = ['staff', 'renter', 'system', 'shop_agent', 'renter_agent', 'public_agent'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]
// A renter's own assistant holds a token bound to one rental, which it names (extensions.md section 8.5).
export type AgentActor = { readonly kind: 'shop_agent' | 'renter_agent' | 'public_agent'; readonly shopId: string | null; readonly actsFor: string | null; readonly rentalId?: string }

// What a tool may do (section 4.4). There is no tier above these, and none charges.
export const TOOL_TIERS = ['read', 'draft', 'propose', 'notify', 'act_under_mandate'] as const
export type ToolTier = (typeof TOOL_TIERS)[number]

const ENTITLED: Readonly<Record<AgentActor['kind'], readonly ToolTier[]>> = {
  // The owner's assistant, the operations agent and the shop's advocate.
  shop_agent: ['read', 'draft', 'propose', 'notify', 'act_under_mandate'],
  // A renter's own assistant, or the renter's advocate, on one rental.
  renter_agent: ['read', 'draft', 'act_under_mandate'],
  // Any assistant that has paid for nothing: public information, quotes and bookings awaiting payment.
  public_agent: ['read', 'draft'],
}

// A person's written permission for an agent to act within limits (section 4.2). Each kind has a fixed, typed set of
// limits; free text is never a limit.
export const MANDATE_KINDS = ['ops_standing_rule', 'agent_hold', 'settlement_shop', 'settlement_renter'] as const
export type MandateKind = (typeof MANDATE_KINDS)[number]
// Each standing rule releases a hold, never charges: after a clean return nobody confirmed, or by waiving a contested
// claim the shop did not decide by the date it promised (section 6.16).
export const STANDING_RULE_CONDITIONS = ['clean_return_unconfirmed', 'decision_promise_missed'] as const
export type StandingRuleCondition = (typeof STANDING_RULE_CONDITIONS)[number]
export type StandingRuleLimits = { readonly proposalKind: 'release_hold'; readonly condition: StandingRuleCondition; readonly dailyCount: number }
// The shop's advocate (extensions.md section 9.4): the smallest share of the claim it may agree to, the largest claim it
// may take on, the most offers each side may make, whether every reduction must cite evidence (when not, it may concede
// for goodwill), and whether the owner or a manager confirms the result.
export type ShopSettlementLimits = { readonly currency: string; readonly lowestSharePercent: number; readonly largestClaimCents: number; readonly rounds: number; readonly evidenceRequired: boolean; readonly finalTap: boolean }
// The renter's advocate: the most it may agree to pay, and whether the renter confirms the result.
export type RenterSettlementLimits = { readonly currency: string; readonly highestTotalCents: number; readonly finalTap: boolean }
export type Mandate = { readonly id: string; readonly kind: MandateKind; readonly grantedTo: string; readonly validFrom: Date; readonly validUntil: Date; readonly revokedAt: Date | null; readonly limits: StandingRuleLimits | ShopSettlementLimits | RenterSettlementLimits | Readonly<Record<string, unknown>> }

export const SETTLEMENT_LIMITS = { minRounds: 1, maxRounds: 10, defaultRounds: 6 } as const

export type MandateAction =
  | { readonly kind: 'execute_proposal'; readonly proposalKind: ProposalKind; readonly condition: string; readonly doneToday: number }
  // An advocate's offer, or its acceptance of the other side's offer, on a claim of the given total.
  | { readonly kind: 'settlement_offer' | 'settlement_accept'; readonly side: 'shop' | 'renter'; readonly totalCents: number; readonly claimTotalCents: number; readonly currency: string }
export type MandateCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_yet_valid' | 'expired' | 'revoked' | 'not_covered' | 'daily_count_reached' | 'claim_too_large' | 'below_lowest_share' | 'above_highest_total' }

function live(mandate: Mandate, now: Date): MandateCheck {
  if (mandate.revokedAt !== null && mandate.revokedAt <= now) return { ok: false, reason: 'revoked' }
  if (now < mandate.validFrom) return { ok: false, reason: 'not_yet_valid' }
  if (now >= mandate.validUntil) return { ok: false, reason: 'expired' }
  return { ok: true }
}

const isStandingRule = (mandate: Mandate): mandate is Mandate & { readonly limits: StandingRuleLimits } => mandate.kind === 'ops_standing_rule'

const wholeCents = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const CURRENCY = /^[A-Z]{3}$/
const hasExactly = (value: object, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value)

// Reads a settlement mandate's limits. Anything but the fixed, typed set is refused, so free text is never a limit.
export function checkSettlementLimits(kind: 'settlement_shop', limits: unknown): Result<ShopSettlementLimits, 'invalid_limits'>
export function checkSettlementLimits(kind: 'settlement_renter', limits: unknown): Result<RenterSettlementLimits, 'invalid_limits'>
export function checkSettlementLimits(kind: 'settlement_shop' | 'settlement_renter', limits: unknown): Result<ShopSettlementLimits | RenterSettlementLimits, 'invalid_limits'> {
  if (typeof limits !== 'object' || limits === null) return fail('invalid_limits')
  const value = limits as Readonly<Record<string, unknown>>
  if (typeof value['currency'] !== 'string' || !CURRENCY.test(value['currency']) || typeof value['finalTap'] !== 'boolean') return fail('invalid_limits')
  if (kind === 'settlement_renter') {
    return hasExactly(value, ['currency', 'highestTotalCents', 'finalTap']) && wholeCents(value['highestTotalCents'])
      ? ok({ currency: value['currency'], highestTotalCents: value['highestTotalCents'], finalTap: value['finalTap'] })
      : fail('invalid_limits')
  }
  const { lowestSharePercent: share, largestClaimCents: largest, rounds, evidenceRequired } = value
  if (!hasExactly(value, ['currency', 'lowestSharePercent', 'largestClaimCents', 'rounds', 'evidenceRequired', 'finalTap']) || !wholeCents(share) || share > 100 || !wholeCents(largest) || !wholeCents(rounds) || rounds < SETTLEMENT_LIMITS.minRounds || rounds > SETTLEMENT_LIMITS.maxRounds || typeof evidenceRequired !== 'boolean') return fail('invalid_limits')
  return ok({ currency: value['currency'], lowestSharePercent: share, largestClaimCents: largest, rounds, evidenceRequired, finalTap: value['finalTap'] })
}

// The least the shop's advocate may agree to: its share of the claim, rounded up to a whole cent so it is never below.
export function shopFloorCents(claimTotalCents: number, lowestSharePercent: number): number {
  return Math.ceil((claimTotalCents * lowestSharePercent) / 100)
}

function withinSettlement(action: Extract<MandateAction, { readonly side: string }>, mandate: Mandate): MandateCheck {
  if (action.side === 'shop' && mandate.kind === 'settlement_shop') {
    const limits = checkSettlementLimits('settlement_shop', mandate.limits)
    if (!limits.ok || limits.value.currency !== action.currency) return { ok: false, reason: 'not_covered' }
    if (action.claimTotalCents > limits.value.largestClaimCents) return { ok: false, reason: 'claim_too_large' }
    return action.totalCents >= shopFloorCents(action.claimTotalCents, limits.value.lowestSharePercent) ? { ok: true } : { ok: false, reason: 'below_lowest_share' }
  }
  if (action.side === 'renter' && mandate.kind === 'settlement_renter') {
    const limits = checkSettlementLimits('settlement_renter', mandate.limits)
    if (!limits.ok || limits.value.currency !== action.currency) return { ok: false, reason: 'not_covered' }
    return action.totalCents <= limits.value.highestTotalCents ? { ok: true } : { ok: false, reason: 'above_highest_total' }
  }
  return { ok: false, reason: 'not_covered' }
}

// Decides whether an action falls inside a mandate. The model is never asked whether it is allowed.
export function withinMandate(action: MandateAction, mandate: Mandate, now: Date): MandateCheck {
  const alive = live(mandate, now)
  if (!alive.ok) return alive
  if (action.kind !== 'execute_proposal') return withinSettlement(action, mandate)
  if (!isStandingRule(mandate) || action.proposalKind !== mandate.limits.proposalKind || action.condition !== mandate.limits.condition) return { ok: false, reason: 'not_covered' }
  if (action.doneToday >= mandate.limits.dailyCount) return { ok: false, reason: 'daily_count_reached' }
  return { ok: true }
}

export type GatewayInput = {
  readonly actor: AgentActor
  readonly tool: { readonly name: string; readonly tier: ToolTier }
  // The shop the call's subject belongs to; null only for public information.
  readonly subjectShopId: string | null
  // The rental the call is about, for an actor bound to one rental.
  readonly subjectRentalId?: string | null
  readonly mandate: Mandate | null
  readonly now: Date
  readonly callsInWindow: number
  readonly rateLimit: number
  readonly argumentsValid: boolean
}
export type GatewayDecision = { readonly ok: true } | { readonly ok: false; readonly reason: 'shop' | 'rental' | 'actor' | 'tier' | 'mandate' | 'rate' | 'arguments' }

// Every tool call from every agent, in the order of section 4.4: the shop (and the one rental an agent token names), the actor and who it acts for, the tier,
// the mandate where the tier needs one, the rate, and the shape of the arguments. The caller writes the audit line.
export function gatewayDecision(input: GatewayInput): GatewayDecision {
  if (input.actor.kind !== 'public_agent' && input.subjectShopId !== input.actor.shopId) return { ok: false, reason: 'shop' }
  if (input.actor.rentalId !== undefined && input.subjectRentalId !== input.actor.rentalId) return { ok: false, reason: 'rental' }
  if (input.actor.kind !== 'public_agent' && (input.actor.actsFor === null || input.actor.actsFor === '')) return { ok: false, reason: 'actor' }
  const entitled = ENTITLED[input.actor.kind].includes(input.tool.tier) && (input.tool.tier !== 'act_under_mandate' || input.actor.kind !== 'shop_agent' || input.mandate !== null)
  if (!entitled) return { ok: false, reason: 'tier' }
  if (input.tool.tier === 'act_under_mandate' && (input.mandate === null || !live(input.mandate, input.now).ok)) return { ok: false, reason: 'mandate' }
  if (input.callsInWindow >= input.rateLimit) return { ok: false, reason: 'rate' }
  if (!input.argumentsValid) return { ok: false, reason: 'arguments' }
  return { ok: true }
}
