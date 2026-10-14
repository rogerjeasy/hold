import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS } from './hold-clocks.ts'
import { chargeTime, planAfterFailedRenewal, planCharge, planUpkeep } from './upkeep.ts'
import type { AuthorizationClocks } from './upkeep.ts'

const PLACED = new Date('2026-10-14T02:54:28Z')
const original: AuthorizationClocks = {
  assuredUntil: addDays(PLACED, HOLD_ASSURED_DAYS),
  validUntil: addDays(PLACED, HOLD_VALIDITY_DAYS),
  isRenewal: false,
}
const renewedOn = (day: number): AuthorizationClocks => ({
  assuredUntil: addDays(PLACED, day + HOLD_ASSURED_DAYS),
  validUntil: original.validUntil,
  isRenewal: true,
})
const day = (days: number) => addDays(PLACED, days)

describe('charging a hold', () => {
  it('captures at once inside the assured period', () => {
    expect(planCharge(original, day(2))).toEqual({ kind: 'capture', assured: true })
  })

  it('renews first once the assured period has passed', () => {
    expect(planCharge(original, day(3))).toEqual({ kind: 'renew_then_capture' })
    expect(planCharge(original, day(20))).toEqual({ kind: 'renew_then_capture' })
  })

  it('captures inside a renewal’s own assured period', () => {
    expect(planCharge(renewedOn(10), day(11))).toEqual({ kind: 'capture', assured: true })
  })

  it('captures without assurance when the one renewal is spent and its period has passed', () => {
    expect(planCharge(renewedOn(10), day(14))).toEqual({ kind: 'capture', assured: false })
  })

  it('sends a claim by invoice once the hold has lapsed', () => {
    expect(planCharge(original, day(HOLD_VALIDITY_DAYS))).toEqual({ kind: 'expired' })
  })

  it('still tries to capture after a failed renewal, while the hold is valid', () => {
    expect(planAfterFailedRenewal(original, day(5))).toEqual({ kind: 'capture', assured: false })
    expect(planAfterFailedRenewal(original, day(HOLD_VALIDITY_DAYS))).toEqual({ kind: 'expired' })
  })

  it('makes every charge on an unrenewed hold assured, whenever it comes within the 29 days', () => {
    const anyMoment = fc.integer({ min: 0, max: HOLD_VALIDITY_DAYS * 24 * 60 - 1 }).map((minutes) => new Date(PLACED.getTime() + minutes * 60_000))
    fc.assert(
      fc.property(anyMoment, (now) => {
        const plan = planCharge(original, now)
        expect(plan.kind === 'renew_then_capture' || (plan.kind === 'capture' && plan.assured)).toBe(true)
      }),
    )
  })
})

describe('when an unanswered claim is charged', () => {
  it('waits for the reply period when it ends in time', () => {
    expect(chargeTime(day(10), original.validUntil)).toEqual({ at: day(10), beforeReplyDue: false })
  })

  it('charges a day before the hold lapses when the reply period would outlast it', () => {
    expect(chargeTime(day(29), original.validUntil)).toEqual({ at: day(28), beforeReplyDue: true })
  })

  it('never charges after the hold has lapsed', () => {
    const anyDue = fc.integer({ min: 0, max: 60 }).map(day)
    fc.assert(
      fc.property(anyDue, (due) => {
        expect(chargeTime(due, original.validUntil).at < original.validUntil).toBe(true)
      }),
    )
  })
})

describe('the upkeep schedule', () => {
  it('starts a replacement three days before the end and marks the end, and plans no renewal', () => {
    expect(planUpkeep(original)).toEqual({ startReplacementAt: day(26), expiresAt: day(29) })
  })
})
