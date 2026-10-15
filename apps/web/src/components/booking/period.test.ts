import { describe, expect, it } from 'vitest'
import { readPeriod } from './period'

const NOW = new Date('2026-10-15T09:10:00Z')

describe('the dates a booking page shows', () => {
  it('starts at the next half hour on the shop’s clock, for one day, when none are given', () => {
    expect(readPeriod({}, 'Europe/Lisbon', NOW)).toMatchObject({ from: '2026-10-15T10:30', to: '2026-10-16T10:30', invalid: false })
  })

  it('reads the dates in the address, on the shop’s clock', () => {
    const read = readPeriod({ from: '2026-10-20T10:00', to: '2026-10-23T18:00' }, 'Europe/Lisbon', NOW)
    expect(read.period).toEqual({ startsAt: new Date('2026-10-20T09:00:00Z'), endsAt: new Date('2026-10-23T17:00:00Z') })
    expect(read.days).toBe(4)
  })

  it('says when the dates cannot be booked, and shows nothing free for them', () => {
    expect(readPeriod({ from: '2026-10-20T10:00', to: '2026-10-19T10:00' }, 'Europe/Lisbon', NOW)).toMatchObject({ invalid: true, period: undefined })
    expect(readPeriod({ from: 'soon', to: 'later' }, 'Europe/Lisbon', NOW)).toMatchObject({ invalid: true, period: undefined })
  })
})
