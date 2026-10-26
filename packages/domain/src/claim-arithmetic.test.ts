import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkClaimLines, claimTotal, settle } from './claim-arithmetic.ts'
import type { ClaimLine } from './claim-arithmetic.ts'
import { money } from './money.ts'

const chf = (cents: number) => money(cents, 'CHF')
const fromFinding = (cents: number, photoCount = 2): ClaimLine => ({
  priceEntryId: 'scratch-deep',
  amount: chf(cents),
  source: { kind: 'finding', findingId: 'finding-1', photoCount },
})
const fromPerson = (cents: number, reason: string, staffId = 'staff-1'): ClaimLine => ({
  priceEntryId: 'cleaning',
  amount: chf(cents),
  source: { kind: 'person', staffId, reason },
})

const agreedInRental = (cents: number, photoCount = 1): ClaimLine => ({
  priceEntryId: 'scratch-deep',
  amount: chf(cents),
  source: { kind: 'agreed_in_rental', incidentId: 'incident-1', photoCount },
})

describe('claim total', () => {
  it('is the sum of the lines', () => {
    expect(claimTotal([fromFinding(80_00), fromPerson(25_50, 'Mud inside the frame')], 'CHF')).toEqual(chf(105_50))
  })

  it('is zero for a claim with no lines', () => {
    expect(claimTotal([], 'CHF')).toEqual(chf(0))
  })
})

describe('claim lines', () => {
  it('accepts lines backed by photographs or by a named person with a reason', () => {
    expect(checkClaimLines([fromFinding(80_00), fromPerson(25_50, 'Mud inside the frame')])).toEqual({ ok: true, value: undefined })
  })

  it('accepts a line the renter agreed during the rental, backed by the photographs they took', () => {
    expect(checkClaimLines([agreedInRental(35_00)])).toEqual({ ok: true, value: undefined })
  })

  it.each([
    ['a finding with no photographs', fromFinding(80_00, 0)],
    ['a person with no reason', fromPerson(25_50, '   ')],
    ['a reason with no person', fromPerson(25_50, 'Mud', '')],
    ['an agreed line with no photographs', agreedInRental(35_00, 0)],
  ])('refuses %s', (_, line) => {
    expect(checkClaimLines([fromFinding(10_00), line])).toEqual({ ok: false, error: { kind: 'line_without_evidence', lineIndex: 1 } })
  })
})

describe('settling a claim against the hold', () => {
  it('captures the claim and releases the rest when the claim fits', () => {
    expect(settle(chf(40_00), chf(150_00))).toEqual({ capture: chf(40_00), release: chf(110_00), invoice: chf(0) })
  })

  it('captures the whole hold and invoices the rest when the claim is larger', () => {
    expect(settle(chf(200_00), chf(150_00))).toEqual({ capture: chf(150_00), release: chf(0), invoice: chf(50_00) })
  })

  it('releases everything for a claim of zero', () => {
    expect(settle(chf(0), chf(150_00))).toEqual({ capture: chf(0), release: chf(150_00), invoice: chf(0) })
  })

  const cents = fc.integer({ min: 0, max: 10_000_000 })

  it('never captures more than the hold or the claim, and accounts for every cent', () => {
    fc.assert(
      fc.property(cents, cents, (claim, reserved) => {
        const { capture, release, invoice } = settle(chf(claim), chf(reserved))
        expect(capture.cents).toBeLessThanOrEqual(reserved)
        expect(capture.cents).toBeLessThanOrEqual(claim)
        expect(capture.cents + release.cents).toBe(reserved)
        expect(capture.cents + invoice.cents).toBe(claim)
      }),
    )
  })
})
