import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, HOLD_ASSURED_DAYS, HOLD_VALIDITY_DAYS } from './hold-clocks.ts'
import { authorizationClocks, checkPlacedAuthorization, keepsOriginalEnd, mayAskForHold, needsReplacement, placementStrategy, holdOrderCents } from './hold-placement.ts'
import { money } from './money.ts'
import { RENTAL_STATES } from './rental.ts'

const PLACED = new Date('2026-10-16T09:30:00Z')

describe('asking for the hold', () => {
  it('is possible once the fee is paid, and again while the renter has not approved', () => {
    expect(RENTAL_STATES.filter(mayAskForHold)).toEqual(['booked', 'awaiting_hold'])
  })
})

describe('the clocks of a placed hold', () => {
  it('run the assured period from the moment PayPal created the authorization, and take its end from PayPal', () => {
    const expiresAt = addDays(PLACED, HOLD_VALIDITY_DAYS)
    expect(authorizationClocks({ createdAt: PLACED, expiresAt }, false)).toEqual({ assuredUntil: addDays(PLACED, HOLD_ASSURED_DAYS), validUntil: expiresAt, isRenewal: false })
  })

  it('never let the assured period outlast the hold itself', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 * 24 * 60 }), (minutes) => {
        const expiresAt = new Date(PLACED.getTime() + minutes * 60_000)
        const clocks = authorizationClocks({ createdAt: PLACED, expiresAt }, true)
        expect(clocks.assuredUntil.getTime()).toBeLessThanOrEqual(expiresAt.getTime())
      }),
    )
  })
})

describe('checking what PayPal placed', () => {
  const asked = money(30_000, 'CHF')

  it('accepts an authorization PayPal created for exactly the amount asked', () => {
    expect(checkPlacedAuthorization(asked, { status: 'created', amount: money(30_000, 'CHF') })).toEqual({ ok: true, value: 'placed' })
  })

  it('waits on an authorization PayPal is still reviewing', () => {
    expect(checkPlacedAuthorization(asked, { status: 'pending', amount: asked })).toEqual({ ok: false, error: 'pending' })
  })

  it('refuses an authorization for any other amount or currency, so nothing is held that the renter did not agree to', () => {
    expect(checkPlacedAuthorization(asked, { status: 'created', amount: money(29_999, 'CHF') })).toEqual({ ok: false, error: 'amount_mismatch' })
    expect(checkPlacedAuthorization(asked, { status: 'created', amount: money(30_000, 'EUR') })).toEqual({ ok: false, error: 'amount_mismatch' })
  })

  it('refuses an authorization PayPal denied, voided or let expire', () => {
    for (const status of ['denied', 'voided', 'expired', 'captured', 'partially_captured'] as const) {
      expect(checkPlacedAuthorization(asked, { status, amount: asked })).toEqual({ ok: false, error: 'not_placed' })
    }
  })
})

describe('replacing a hold near its end', () => {
  it('is needed while the rental may still need its hold: before handover, out, and until it is settled', () => {
    expect(RENTAL_STATES.filter(needsReplacement)).toEqual(['ready', 'out', 'overdue', 'returned', 'inspecting', 'settling'])
  })
})

describe('a renewal’s end of validity', () => {
  const original = new Date('2026-11-12T02:54:28Z')

  // PayPal's sandbox, 28 October 2026: a hold placed on 14 October was renewed to end at 02:54:29, one second later.
  it('keeps the original’s end, allowing for the second PayPal adds', () => {
    expect(keepsOriginalEnd(original, new Date('2026-11-12T02:54:29Z'))).toBe(true)
    expect(keepsOriginalEnd(original, original)).toBe(true)
  })

  it('refuses a renewal that would hold the renter’s money past the original 29 days', () => {
    expect(keepsOriginalEnd(original, new Date('2026-11-12T02:56:00Z'))).toBe(false)
  })
})

// architecture.md section 8.2: staff may let a walk-in approve the fee and the hold once, in one authorization. They
// choose it, because a renter whose Clean Record would lower the hold is known only from the fee they paid first.
describe('which way the hold is placed', () => {
  // 10:00 in Lisbon on 28 October 2026.
  const now = new Date('2026-10-28T10:00:00Z')
  const lisbon = 'Europe/Lisbon'
  const walkIn = { asked: 'combined' as const, bookedThrough: 'staff' as const, timeZone: lisbon, now }

  it('combines the fee and the hold when staff ask for it, for a rental at the counter that starts today', () => {
    expect(placementStrategy({ ...walkIn, startsAt: new Date('2026-10-28T10:05:00Z') })).toBe('combined')
    expect(placementStrategy({ ...walkIn, startsAt: new Date('2026-10-28T22:30:00Z') })).toBe('combined')
  })

  it('places the hold at the counter unless staff ask, so a returning renter’s record can lower it', () => {
    expect(placementStrategy({ ...walkIn, asked: 'at_counter', startsAt: new Date('2026-10-28T10:05:00Z') })).toBe('at_counter')
  })

  it('places the hold at the counter for a rental that starts on another day, as a hold lasts only 29 days', () => {
    expect(placementStrategy({ ...walkIn, startsAt: new Date('2026-10-29T09:00:00Z') })).toBe('at_counter')
    // Midnight is the shop's own: 00:30 on the 29th in Lisbon is still the 28th in UTC.
    expect(placementStrategy({ ...walkIn, startsAt: new Date('2026-10-29T00:30:00Z') })).toBe('at_counter')
  })

  // Only staff at the counter see the renter. A booking on the shop's page or through an assistant pays its fee alone.
  it('places the hold at the counter for a booking not made by staff', () => {
    for (const bookedThrough of ['shop_page', 'assistant'] as const) expect(placementStrategy({ ...walkIn, bookedThrough, startsAt: new Date('2026-10-28T11:00:00Z') })).toBe('at_counter')
  })
})

describe('what the renter approves in PayPal for the hold', () => {
  it('is the fee and the hold together on a walk-in’s first order, and the hold alone on any other', () => {
    expect(holdOrderCents({ strategy: 'combined', state: 'requested', reservedCents: 250_00, feeCents: 25_00 })).toBe(275_00)
    expect(holdOrderCents({ strategy: 'at_counter', state: 'requested', reservedCents: 250_00, feeCents: 25_00 })).toBe(250_00)
    // A replacement, asked for once a walk-in's hold is placed, is for the hold alone: the fee was taken.
    expect(holdOrderCents({ strategy: 'combined', state: 'placed', reservedCents: 250_00, feeCents: 25_00 })).toBe(250_00)
  })
})
