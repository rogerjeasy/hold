import { describe, expect, it } from 'vitest'
import { atShopTime, shopDay, shopTimeText } from './shop-calendar.ts'

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

describe('a time on the shop’s clock', () => {
  it('becomes the instant it names, in summer and in winter', () => {
    expect(atShopTime('Europe/Lisbon', '2026-10-16T10:00')).toEqual(new Date('2026-10-16T09:00:00Z'))
    expect(atShopTime('Europe/Lisbon', '2026-11-16T10:00')).toEqual(new Date('2026-11-16T10:00:00Z'))
    expect(atShopTime('America/New_York', '2026-10-16T18:30')).toEqual(new Date('2026-10-16T22:30:00Z'))
  })

  it('is nothing for text that is not a date and a time', () => {
    expect(atShopTime('Europe/Lisbon', '2026-13-01T10:00')).toBeUndefined()
    expect(atShopTime('Europe/Lisbon', 'tomorrow')).toBeUndefined()
    expect(atShopTime('Europe/Lisbon', '2026-02-30T10:00')).toBeUndefined()
  })

  it('is read back as the shop’s clock shows it', () => {
    expect(shopTimeText('Europe/Lisbon', new Date('2026-10-16T09:00:00Z'))).toBe('2026-10-16T10:00')
  })
})
