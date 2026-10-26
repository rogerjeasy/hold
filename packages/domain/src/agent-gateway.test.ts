import { describe, expect, it } from 'vitest'
import { gatewayDecision, withinMandate } from './agent-gateway.ts'
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

  it('refuses a renter’s assistant on any rental but the one its token names', () => {
    const assistant = { kind: 'renter_agent' as const, shopId: 'shop-1', actsFor: 'renter-1', rentalId: 'rental-1' }
    expect(gatewayDecision({ ...base, actor: assistant, subjectRentalId: 'rental-1' })).toEqual({ ok: true })
    expect(gatewayDecision({ ...base, actor: assistant, subjectRentalId: 'rental-2', argumentsValid: false })).toEqual({ ok: false, reason: 'rental' })
    expect(gatewayDecision({ ...base, actor: assistant, subjectRentalId: null })).toEqual({ ok: false, reason: 'rental' })
  })

  it('refuses beyond the rate limit, then arguments of the wrong shape', () => {
    expect(gatewayDecision({ ...base, callsInWindow: 60 })).toEqual({ ok: false, reason: 'rate' })
    expect(gatewayDecision({ ...base, argumentsValid: false })).toEqual({ ok: false, reason: 'arguments' })
  })
})
