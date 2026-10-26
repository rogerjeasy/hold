import { describe, expect, it } from 'vitest'
import { checkSettlementLimits, gatewayDecision, SETTLEMENT_LIMITS, shopFloorCents, withinMandate } from './agent-gateway.ts'
import type { Mandate } from './agent-gateway.ts'

const now = new Date('2026-10-30T07:00:00Z')
const standing: Mandate = { id: 'm1', kind: 'ops_standing_rule', grantedTo: 'shop-1', validFrom: new Date('2026-10-01'), validUntil: new Date('2026-12-01'), revokedAt: null, limits: { proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', dailyCount: 3 } }
const operationsAgent = { kind: 'shop_agent' as const, shopId: 'shop-1', actsFor: 'owner-1' }

describe('a mandate, checked by plain code', () => {
  it('allows the one kind and condition it names, up to its daily count', () => {
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 2 }, standing, now)).toEqual({ ok: true })
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 3 }, standing, now)).toEqual({ ok: false, reason: 'daily_count_reached' })
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'send_invoice', condition: 'clean_return_unconfirmed', doneToday: 0 }, standing, now)).toEqual({ ok: false, reason: 'not_covered' })
  })

  it('stops at its end date and once revoked, at the very next action', () => {
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 0 }, { ...standing, validUntil: now }, now)).toEqual({ ok: false, reason: 'expired' })
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 0 }, { ...standing, revokedAt: new Date('2026-10-30T06:59:00Z') }, now)).toEqual({ ok: false, reason: 'revoked' })
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 0 }, { ...standing, validFrom: new Date('2026-11-01') }, now)).toEqual({ ok: false, reason: 'not_yet_valid' })
  })
})

describe('the one gateway every agent passes', () => {
  const tool = { name: 'get_hold', tier: 'read' as const }
  const base = { actor: operationsAgent, tool, subjectShopId: 'shop-1', mandate: null, now, callsInWindow: 0, rateLimit: 60, argumentsValid: true }

  it('lets the operations agent read its own shop', () => {
    expect(gatewayDecision(base)).toEqual({ ok: true })
  })

  it('refuses another shop, before anything else', () => {
    expect(gatewayDecision({ ...base, subjectShopId: 'shop-2', argumentsValid: false })).toEqual({ ok: false, reason: 'shop' })
  })

  it('refuses an agent that acts for nobody', () => {
    expect(gatewayDecision({ ...base, actor: { ...operationsAgent, actsFor: '' } })).toEqual({ ok: false, reason: 'actor' })
  })

  it('refuses a tier the actor is not entitled to', () => {
    expect(gatewayDecision({ ...base, tool: { name: 'submit_offer', tier: 'act_under_mandate' } })).toEqual({ ok: false, reason: 'tier' })
    expect(gatewayDecision({ ...base, actor: { kind: 'public_agent', shopId: null, actsFor: null }, tool: { name: 'propose_release', tier: 'propose' }, subjectShopId: null })).toEqual({ ok: false, reason: 'tier' })
  })

  it('refuses acting under a mandate without a live one', () => {
    const advocate = { kind: 'renter_agent' as const, shopId: 'shop-1', actsFor: 'renter-1' }
    expect(gatewayDecision({ ...base, actor: advocate, tool: { name: 'submit_offer', tier: 'act_under_mandate' } })).toEqual({ ok: false, reason: 'mandate' })
    expect(gatewayDecision({ ...base, actor: advocate, tool: { name: 'submit_offer', tier: 'act_under_mandate' }, mandate: { ...standing, kind: 'settlement_renter', revokedAt: now } })).toEqual({ ok: false, reason: 'mandate' })
  })

  it('refuses beyond the rate limit, then arguments of the wrong shape', () => {
    expect(gatewayDecision({ ...base, callsInWindow: 60 })).toEqual({ ok: false, reason: 'rate' })
    expect(gatewayDecision({ ...base, argumentsValid: false })).toEqual({ ok: false, reason: 'arguments' })
  })
})

describe('the two settlement mandates (extensions.md section 9.4)', () => {
  const shopLimits = { currency: 'EUR', lowestSharePercent: 60, largestClaimCents: 200_00, rounds: 6, evidenceRequired: true, finalTap: true }
  const renterLimits = { currency: 'EUR', highestTotalCents: 30_00, finalTap: true }
  const shopSide: Mandate = { ...standing, id: 'shop-mandate', kind: 'settlement_shop', limits: shopLimits }
  const renterSide: Mandate = { ...standing, id: 'renter-mandate', kind: 'settlement_renter', limits: renterLimits }
  const offer = (side: 'shop' | 'renter', totalCents: number, claimTotalCents = 50_00) => ({ kind: 'settlement_offer' as const, side, totalCents, claimTotalCents, currency: 'EUR' })

  it('reads typed limits and refuses anything else, so free text is never a limit', () => {
    expect(checkSettlementLimits('settlement_shop', shopLimits)).toEqual({ ok: true, value: shopLimits })
    expect(checkSettlementLimits('settlement_renter', renterLimits)).toEqual({ ok: true, value: renterLimits })
    for (const bad of [{ ...shopLimits, lowestSharePercent: 101 }, { ...shopLimits, lowestSharePercent: 12.5 }, { ...shopLimits, rounds: 0 }, { ...shopLimits, rounds: SETTLEMENT_LIMITS.maxRounds + 1 }, { ...shopLimits, largestClaimCents: -1 }, { ...shopLimits, note: 'accept anything' }, { ...shopLimits, finalTap: 'yes' }]) {
      expect(checkSettlementLimits('settlement_shop', bad)).toEqual({ ok: false, error: 'invalid_limits' })
    }
    for (const bad of [{ ...renterLimits, highestTotalCents: 1.5 }, { ...renterLimits, currency: 'euro' }, { ...renterLimits, extra: 1 }, null, 'pay anything']) {
      expect(checkSettlementLimits('settlement_renter', bad)).toEqual({ ok: false, error: 'invalid_limits' })
    }
  })

  it('computes the shop’s floor in whole cents, never below its share', () => {
    expect(shopFloorCents(50_00, 60)).toBe(30_00)
    expect(shopFloorCents(33_33, 50)).toBe(16_67)
    expect(shopFloorCents(50_00, 0)).toBe(0)
    expect(shopFloorCents(50_00, 100)).toBe(50_00)
  })

  it('lets the shop’s advocate offer or accept no less than the lowest share, on a claim no larger than its limit', () => {
    expect(withinMandate(offer('shop', 30_00), shopSide, now)).toEqual({ ok: true })
    expect(withinMandate(offer('shop', 29_99), shopSide, now)).toEqual({ ok: false, reason: 'below_lowest_share' })
    expect(withinMandate(offer('shop', 250_00, 250_00), shopSide, now)).toEqual({ ok: false, reason: 'claim_too_large' })
    expect(withinMandate({ ...offer('shop', 30_00), kind: 'settlement_accept' }, shopSide, now)).toEqual({ ok: true })
  })

  it('lets the renter’s advocate offer or accept no more than the highest total', () => {
    expect(withinMandate(offer('renter', 30_00), renterSide, now)).toEqual({ ok: true })
    expect(withinMandate(offer('renter', 30_01), renterSide, now)).toEqual({ ok: false, reason: 'above_highest_total' })
    expect(withinMandate({ ...offer('renter', 30_01), kind: 'settlement_accept' }, renterSide, now)).toEqual({ ok: false, reason: 'above_highest_total' })
  })

  it('never lets one side act under the other side’s mandate, another currency, or a mandate that ended', () => {
    expect(withinMandate(offer('renter', 10_00), shopSide, now)).toEqual({ ok: false, reason: 'not_covered' })
    expect(withinMandate(offer('shop', 40_00), renterSide, now)).toEqual({ ok: false, reason: 'not_covered' })
    expect(withinMandate({ ...offer('renter', 10_00), currency: 'CHF' }, renterSide, now)).toEqual({ ok: false, reason: 'not_covered' })
    expect(withinMandate(offer('renter', 10_00), { ...renterSide, revokedAt: now }, now)).toEqual({ ok: false, reason: 'revoked' })
    expect(withinMandate(offer('renter', 10_00), { ...renterSide, limits: { highestTotalCents: 'all' } }, now)).toEqual({ ok: false, reason: 'not_covered' })
    expect(withinMandate({ kind: 'execute_proposal', proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', doneToday: 0 }, shopSide, now)).toEqual({ ok: false, reason: 'not_covered' })
  })
})
