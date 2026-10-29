import { describe, expect, it } from 'vitest'
import { checkExtension, EXTENSION_LIMITS, extensionPaymentDeadline } from './extension.ts'

const hours = (from: Date, count: number) => new Date(from.getTime() + count * 3_600_000)
const startsAt = new Date('2026-11-01T09:00:00Z')
const endsAt = new Date('2026-11-04T09:00:00Z')
const now = new Date('2026-11-03T20:00:00Z')
const request = {
  state: 'out' as const,
  startsAt,
  endsAt,
  newEndsAt: hours(endsAt, 48),
  now,
  maxDays: 7,
  holdValidUntil: new Date('2026-11-30T09:00:00Z'),
  lines: [{ dayRateCents: 45_00, count: 1 }, { dayRateCents: 8_00, count: 2 }],
  currency: 'EUR',
  nextBookingStartsAt: null,
}

describe('extending a rental from the renter’s phone', () => {
  it('prices each started day past the current end at the day rates agreed at booking', () => {
    expect(checkExtension(request)).toEqual({ ok: true, value: { extraDays: 2, fee: { cents: 2 * (45_00 + 2 * 8_00), currency: 'EUR' }, endsAt: hours(endsAt, 48) } })
    expect(checkExtension({ ...request, newEndsAt: hours(endsAt, 3) })).toMatchObject({ ok: true, value: { extraDays: 1 } })
    expect(checkExtension({ ...request, newEndsAt: hours(endsAt, 25) })).toMatchObject({ ok: true, value: { extraDays: 2 } })
  })

  it('is only for a rental the renter has, to a later end that has not passed', () => {
    for (const state of ['booked', 'ready', 'overdue', 'dropped_off', 'returned', 'closed'] as const) expect(checkExtension({ ...request, state })).toEqual({ ok: false, error: { kind: 'not_out' } })
    expect(checkExtension({ ...request, newEndsAt: endsAt })).toEqual({ ok: false, error: { kind: 'not_later' } })
    expect(checkExtension({ ...request, newEndsAt: hours(now, -1), endsAt: hours(now, -2) })).toEqual({ ok: false, error: { kind: 'not_later' } })
  })

  it('keeps to the most extra days the shop allows, and none when it allows none', () => {
    expect(checkExtension({ ...request, newEndsAt: hours(endsAt, 8 * 24) })).toEqual({ ok: false, error: { kind: 'too_many_days', maxDays: 7 } })
    expect(checkExtension({ ...request, maxDays: 0 })).toEqual({ ok: false, error: { kind: 'off' } })
  })

  it('refuses an end the hold cannot cover, naming the latest it can, with time to check the return and charge a claim', () => {
    const holdValidUntil = hours(endsAt, 5 * 24)
    const latest = hours(holdValidUntil, -EXTENSION_LIMITS.returnToCaptureDays * 24)
    expect(checkExtension({ ...request, holdValidUntil, newEndsAt: hours(latest, 1) })).toEqual({ ok: false, error: { kind: 'beyond_hold', latest } })
    expect(checkExtension({ ...request, holdValidUntil, newEndsAt: latest })).toMatchObject({ ok: true })
    expect(checkExtension({ ...request, holdValidUntil: null })).toEqual({ ok: false, error: { kind: 'no_hold' } })
  })

  it('refuses days another booking already has, naming when the item is needed', () => {
    const nextBookingStartsAt = hours(endsAt, 30)
    expect(checkExtension({ ...request, nextBookingStartsAt })).toEqual({ ok: false, error: { kind: 'not_free', neededFrom: nextBookingStartsAt } })
  })
})

describe('how long a capture PayPal reports as pending is waited for', () => {
  it('waits until the old end, and never less than a day after the capture began', () => {
    expect(extensionPaymentDeadline(endsAt, now)).toEqual(hours(now, EXTENSION_LIMITS.pendingPaymentHours))
    expect(extensionPaymentDeadline(hours(now, 72), now)).toEqual(hours(now, 72))
  })
})
