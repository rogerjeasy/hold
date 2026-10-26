import type { ProposalKind } from './proposal.ts'

// Who acts (extensions.md section 4.1). An agent always names the person it acts for.
export const ACTOR_KINDS = ['staff', 'renter', 'system', 'shop_agent', 'renter_agent', 'public_agent'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]
export type AgentActor = { readonly kind: 'shop_agent' | 'renter_agent' | 'public_agent'; readonly shopId: string | null; readonly actsFor: string | null }

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
export type StandingRuleLimits = { readonly proposalKind: 'release_hold'; readonly condition: 'clean_return_unconfirmed'; readonly dailyCount: number }
export type Mandate = { readonly id: string; readonly kind: MandateKind; readonly grantedTo: string; readonly validFrom: Date; readonly validUntil: Date; readonly revokedAt: Date | null; readonly limits: StandingRuleLimits | Readonly<Record<string, unknown>> }

export type MandateAction = { readonly kind: 'execute_proposal'; readonly proposalKind: ProposalKind; readonly condition: string; readonly doneToday: number }
export type MandateCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'not_yet_valid' | 'expired' | 'revoked' | 'not_covered' | 'daily_count_reached' }

function live(mandate: Mandate, now: Date): MandateCheck {
  if (mandate.revokedAt !== null && mandate.revokedAt <= now) return { ok: false, reason: 'revoked' }
  if (now < mandate.validFrom) return { ok: false, reason: 'not_yet_valid' }
  if (now >= mandate.validUntil) return { ok: false, reason: 'expired' }
  return { ok: true }
}

const isStandingRule = (mandate: Mandate): mandate is Mandate & { readonly limits: StandingRuleLimits } => mandate.kind === 'ops_standing_rule'

// Decides whether an action falls inside a mandate. The model is never asked whether it is allowed.
export function withinMandate(action: MandateAction, mandate: Mandate, now: Date): MandateCheck {
  const alive = live(mandate, now)
  if (!alive.ok) return alive
  if (!isStandingRule(mandate) || action.proposalKind !== mandate.limits.proposalKind || action.condition !== mandate.limits.condition) return { ok: false, reason: 'not_covered' }
  if (action.doneToday >= mandate.limits.dailyCount) return { ok: false, reason: 'daily_count_reached' }
  return { ok: true }
}

export type GatewayInput = {
  readonly actor: AgentActor
  readonly tool: { readonly name: string; readonly tier: ToolTier }
  // The shop the call's subject belongs to; null only for public information.
  readonly subjectShopId: string | null
  readonly mandate: Mandate | null
  readonly now: Date
  readonly callsInWindow: number
  readonly rateLimit: number
  readonly argumentsValid: boolean
}
export type GatewayDecision = { readonly ok: true } | { readonly ok: false; readonly reason: 'shop' | 'actor' | 'tier' | 'mandate' | 'rate' | 'arguments' }

// Every tool call from every agent, in the order of section 4.4: the shop, the actor and who it acts for, the tier,
// the mandate where the tier needs one, the rate, and the shape of the arguments. The caller writes the audit line.
export function gatewayDecision(input: GatewayInput): GatewayDecision {
  if (input.actor.kind !== 'public_agent' && input.subjectShopId !== input.actor.shopId) return { ok: false, reason: 'shop' }
  if (input.actor.kind !== 'public_agent' && (input.actor.actsFor === null || input.actor.actsFor === '')) return { ok: false, reason: 'actor' }
  const entitled = ENTITLED[input.actor.kind].includes(input.tool.tier) && (input.tool.tier !== 'act_under_mandate' || input.actor.kind !== 'shop_agent' || input.mandate !== null)
  if (!entitled) return { ok: false, reason: 'tier' }
  if (input.tool.tier === 'act_under_mandate' && (input.mandate === null || !live(input.mandate, input.now).ok)) return { ok: false, reason: 'mandate' }
  if (input.callsInWindow >= input.rateLimit) return { ok: false, reason: 'rate' }
  if (!input.argumentsValid) return { ok: false, reason: 'arguments' }
  return { ok: true }
}
