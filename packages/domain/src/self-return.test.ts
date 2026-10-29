import { describe, expect, it } from 'vitest'
import { checkSelfReturnSettings, DROP_POINT_VIEW, maySelfReturn, returnedOnTime, selfReturnStage, selfReturnViews, shopOpening } from './self-return.ts'

const LISBON = 'Europe/Lisbon'
const HOURS = { opens: '09:00', closes: '19:00' }

describe('who may return an item themselves', () => {
  it('needs the shop to allow it, the rental out or late, and every item handed over with sealed photographs', () => {
    expect(maySelfReturn({ allowed: true, rentalState: 'out', handedOver: true })).toBe(true)
    expect(maySelfReturn({ allowed: true, rentalState: 'overdue', handedOver: true })).toBe(true)
    expect(maySelfReturn({ allowed: false, rentalState: 'out', handedOver: true })).toBe(false)
    expect(maySelfReturn({ allowed: true, rentalState: 'out', handedOver: false })).toBe(false)
    for (const rentalState of ['ready', 'dropped_off', 'returned', 'inspecting', 'settling', 'closed'] as const) {
      expect(maySelfReturn({ allowed: true, rentalState, handedOver: true })).toBe(false)
    }
  })
})

describe('the views a renter photographs', () => {
  it('are every view photographed at the handover, each required, then where the item was left', () => {
    const plan = [
      { key: 'left-side', label: 'Left side', outline: 'whole_side' as const, required: true },
      { key: 'battery', label: 'Battery', outline: 'detail' as const, required: false },
      { key: 'basket', label: 'Basket', outline: 'detail' as const, required: false },
    ]
    expect(selfReturnViews(plan, ['battery', 'left-side'])).toEqual([
      { key: 'left-side', label: 'Left side', outline: 'whole_side', required: true },
      { key: 'battery', label: 'Battery', outline: 'detail', required: true },
      { key: DROP_POINT_VIEW, label: DROP_POINT_VIEW, outline: 'whole_side', required: true },
    ])
  })
})

describe('whether a return was on time', () => {
  it('counts the moment the renter sent it, not when a person looked', () => {
    const endsAt = new Date('2026-11-04T18:00:00Z')
    expect(returnedOnTime(new Date('2026-11-04T18:00:00Z'), endsAt)).toBe(true)
    expect(returnedOnTime(new Date('2026-11-04T18:00:01Z'), endsAt)).toBe(false)
  })
})

describe('when a person at the shop will look', () => {
  // Lisbon is UTC+0 in November.
  it('is now while the shop is open', () => {
    expect(shopOpening(HOURS, LISBON, new Date('2026-11-04T09:00:00Z'))).toEqual({ open: true })
    expect(shopOpening(HOURS, LISBON, new Date('2026-11-04T18:59:00Z'))).toEqual({ open: true })
  })

  it('is the next morning after closing, and later today before opening', () => {
    expect(shopOpening(HOURS, LISBON, new Date('2026-11-04T21:40:00Z'))).toEqual({ open: false, opensAt: new Date('2026-11-05T09:00:00Z') })
    expect(shopOpening(HOURS, LISBON, new Date('2026-11-04T19:00:00Z'))).toEqual({ open: false, opensAt: new Date('2026-11-05T09:00:00Z') })
    expect(shopOpening(HOURS, LISBON, new Date('2026-11-04T06:30:00Z'))).toEqual({ open: false, opensAt: new Date('2026-11-04T09:00:00Z') })
  })

  it('reads the hours on the shop’s own clock, across a change of offset', () => {
    // Lisbon moves to UTC+1 on 29 March 2026: 09:00 there is 08:00 UTC.
    expect(shopOpening(HOURS, LISBON, new Date('2026-03-28T22:00:00Z'))).toEqual({ open: false, opensAt: new Date('2026-03-29T08:00:00Z') })
  })

  it('is unknown when the shop has not said its hours', () => {
    expect(shopOpening(null, LISBON, new Date('2026-11-04T21:40:00Z'))).toBeUndefined()
  })
})

describe('the shop’s self-return settings', () => {
  it('need a drop point to switch it on, and hours that open before they close', () => {
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: 'The locked rack left of the door.', hours: HOURS })).toEqual({ ok: true, value: { allowed: true, dropPoint: 'The locked rack left of the door.', hours: HOURS } })
    expect(checkSelfReturnSettings({ allowed: false, dropPoint: '  ', hours: null })).toEqual({ ok: true, value: { allowed: false, dropPoint: null, hours: null } })
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: ' ', hours: HOURS })).toEqual({ ok: false, error: 'drop_point_needed' })
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: 'x'.repeat(301), hours: HOURS })).toEqual({ ok: false, error: 'drop_point_too_long' })
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: 'Rack', hours: { opens: '19:00', closes: '09:00' } })).toEqual({ ok: false, error: 'hours_invalid' })
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: 'Rack', hours: { opens: '9:00', closes: '19:00' } })).toEqual({ ok: false, error: 'hours_invalid' })
    expect(checkSelfReturnSettings({ allowed: true, dropPoint: 'Rack', hours: { opens: '09:00', closes: '24:00' } })).toEqual({ ok: false, error: 'hours_invalid' })
  })
})

describe('what the renter’s return page shows', () => {
  const rental = { allowed: true, rentalState: 'out' as const, handedOver: true, started: false, droppedOffAt: null }

  it('explains first, then asks for the photographs once started, then shows the receipt for good', () => {
    expect(selfReturnStage(rental)).toBe('intro')
    expect(selfReturnStage({ ...rental, started: true })).toBe('capture')
    const sent = new Date('2026-11-04T21:40:00Z')
    for (const rentalState of ['dropped_off', 'returned', 'inspecting', 'settling', 'closed'] as const) {
      expect(selfReturnStage({ ...rental, rentalState, started: true, droppedOffAt: sent, allowed: false })).toBe('sent')
    }
  })

  it('says it is not open where the shop does not allow it, before the handover, or after a return at the counter', () => {
    expect(selfReturnStage({ ...rental, allowed: false })).toBe('unavailable')
    expect(selfReturnStage({ ...rental, handedOver: false })).toBe('unavailable')
    expect(selfReturnStage({ ...rental, rentalState: 'returned', started: true })).toBe('unavailable')
  })
})
