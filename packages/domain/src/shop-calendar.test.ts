import { describe, expect, it } from 'vitest'
import { shopDay } from './shop-calendar.ts'

describe('the shop’s day', () => {
  it('runs from midnight to midnight in the shop’s time zone', () => {
    const day = shopDay('Europe/Lisbon', new Date('2026-10-14T09:12:00Z'))
    expect(day.start.toISOString()).toBe('2026-10-13T23:00:00.000Z')
    expect(day.end.toISOString()).toBe('2026-10-14T23:00:00.000Z')
    expect(day.monthStart.toISOString()).toBe('2026-09-30T23:00:00.000Z')
  })

  it('takes the shop’s date, not the server’s', () => {
    // 23:30 in UTC is already the next morning in Tokyo.
    const day = shopDay('Asia/Tokyo', new Date('2026-10-14T23:30:00Z'))
    expect(day.start.toISOString()).toBe('2026-10-14T15:00:00.000Z')
  })

  it('is 25 hours long on the day the clocks go back', () => {
    const day = shopDay('Europe/Lisbon', new Date('2026-10-25T12:00:00Z'))
    expect(day.start.toISOString()).toBe('2026-10-24T23:00:00.000Z')
    expect(day.end.toISOString()).toBe('2026-10-26T00:00:00.000Z')
  })

  it('names the part of the day by the shop’s clock', () => {
    expect(shopDay('Europe/Lisbon', new Date('2026-10-14T09:12:00Z')).part).toBe('morning')
    expect(shopDay('Europe/Lisbon', new Date('2026-10-14T13:00:00Z')).part).toBe('afternoon')
    expect(shopDay('Europe/Lisbon', new Date('2026-10-14T19:00:00Z')).part).toBe('evening')
    expect(shopDay('Europe/Lisbon', new Date('2026-10-14T02:00:00Z')).part).toBe('night')
  })
})
