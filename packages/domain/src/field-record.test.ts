import { describe, expect, it } from 'vitest'
import { fieldRecordAlarm } from './field-record.ts'

const month = (name: string, removed: number, total: number) => ({ month: name, removed, total })

// A sharp rise in findings people remove means the comparison and the shop's staff have started to disagree.
describe('the field record alarm', () => {
  it('rings when this month\'s share of removed findings rises well above the months before', () => {
    expect(fieldRecordAlarm([month('2026-08', 2, 20), month('2026-09', 3, 20), month('2026-10', 8, 16)])).toBe(true)
  })

  it('stays quiet for an ordinary month', () => {
    expect(fieldRecordAlarm([month('2026-08', 2, 20), month('2026-09', 3, 20), month('2026-10', 4, 18)])).toBe(false)
  })

  it('stays quiet on too few findings to tell', () => {
    expect(fieldRecordAlarm([month('2026-09', 0, 10), month('2026-10', 3, 4)])).toBe(false)
  })

  it('rings when a first month already has most findings removed', () => {
    expect(fieldRecordAlarm([month('2026-10', 7, 10)])).toBe(true)
  })

  it('stays quiet with no record', () => {
    expect(fieldRecordAlarm([])).toBe(false)
  })
})
