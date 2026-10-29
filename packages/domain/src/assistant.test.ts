import { describe, expect, it } from 'vitest'
import { agentSessionLive, agentTokenExpiry, AGENT_SCOPES, ASSISTANT_LIMITS, assistantBookingStatus, mayBookUnpaid, quoteState } from './assistant.ts'

const NOW = new Date('2026-10-30T09:00:00Z')
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)

describe('a quote', () => {
  it('can be booked from once, until it expires', () => {
    expect(quoteState({ expiresAt: minutes(1), rentalId: null }, NOW)).toBe('usable')
    expect(quoteState({ expiresAt: NOW, rentalId: null }, NOW)).toBe('expired')
    expect(quoteState({ expiresAt: minutes(1), rentalId: 'rental-1' }, NOW)).toBe('used')
  })

  it('lasts as long as an unpaid booking keeps its items', () => {
    expect(ASSISTANT_LIMITS.quoteMinutes).toBe(15)
  })
})

describe('a booking made by an assistant, as get_booking reports it', () => {
  const booking = { state: 'pending_payment' as const, createdAt: NOW, feeCaptured: false, captureBegun: false }

  it('waits for payment for fifteen minutes', () => {
    expect(assistantBookingStatus(booking, minutes(15))).toBe('awaiting_payment')
  })

  it('expires once its fifteen minutes are over and no capture has begun', () => {
    expect(assistantBookingStatus(booking, minutes(16))).toBe('expired')
    expect(assistantBookingStatus({ ...booking, state: 'abandoned' }, minutes(1))).toBe('expired')
  })

  it('does not expire while PayPal is capturing a fee the renter approved', () => {
    expect(assistantBookingStatus({ ...booking, captureBegun: true }, minutes(16))).toBe('awaiting_payment')
  })

  it('is paid only once PayPal’s capture of the fee is on record', () => {
    expect(assistantBookingStatus({ ...booking, state: 'booked', feeCaptured: true }, minutes(60))).toBe('paid')
    expect(assistantBookingStatus({ ...booking, state: 'booked', feeCaptured: false }, minutes(1))).toBe('awaiting_payment')
  })

  it('reports a booking cancelled after payment as cancelled', () => {
    expect(assistantBookingStatus({ ...booking, state: 'cancelled', feeCaptured: true }, minutes(1))).toBe('cancelled')
  })
})

describe('the cap on unpaid bookings', () => {
  it('lets a shop hold only a few unpaid bookings made by assistants at once', () => {
    expect(mayBookUnpaid({ unpaidInShop: ASSISTANT_LIMITS.unpaidPerShop - 1 })).toBe(true)
    expect(mayBookUnpaid({ unpaidInShop: ASSISTANT_LIMITS.unpaidPerShop })).toBe(false)
  })
})

describe('an agent token', () => {
  it('lasts until two weeks after the rental ends, through its return and any claim', () => {
    expect(agentTokenExpiry(new Date('2026-11-03T10:00:00Z'))).toEqual(new Date('2026-11-17T10:00:00Z'))
  })

  it('works only while unexpired and not revoked, and stops at the next call once revoked', () => {
    expect(agentSessionLive({ expiresAt: minutes(1), revokedAt: null }, NOW)).toBe(true)
    expect(agentSessionLive({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false)
    expect(agentSessionLive({ expiresAt: minutes(60), revokedAt: NOW }, NOW)).toBe(false)
    expect(agentSessionLive({ expiresAt: null, revokedAt: null }, NOW)).toBe(false)
  })

  it('has no scope that moves money', () => {
    expect(AGENT_SCOPES).toEqual(['rental', 'hold', 'condition', 'claim', 'record', 'extend'])
  })
})
