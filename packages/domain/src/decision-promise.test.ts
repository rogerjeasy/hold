import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { checkPromiseDays, DECISION_PROMISE, decideByFor, missedPromiseOutcome, promiseDueSoon, promiseStanding } from './decision-promise.ts'

const zurich = 'Europe/Zurich'
const contestedAt = new Date('2026-10-31T15:12:00Z')

describe('the date a shop promises to decide by', () => {
  it('is the shop closing time on the day the promise ends, on the shop clock', () => {
    expect(decideByFor({ contestedAt, days: 3, timeZone: zurich, closes: '18:00', validUntil: null })).toEqual(new Date('2026-11-03T17:00:00Z'))
  })

  it('is the last minute of that day when the shop has not said its hours', () => {
    expect(decideByFor({ contestedAt, days: 1, timeZone: zurich, closes: null, validUntil: null })).toEqual(new Date('2026-11-01T22:59:00Z'))
  })

  it('never falls after the last moment the hold can still be charged', () => {
    const validUntil = new Date('2026-11-02T09:00:00Z')
    expect(decideByFor({ contestedAt, days: 3, timeZone: zurich, closes: '18:00', validUntil })).toEqual(new Date('2026-11-01T09:00:00Z'))
  })

  it('ignores a hold already past its last charge time, which deciding sooner could not save', () => {
    const validUntil = new Date('2026-11-01T09:00:00Z')
    expect(decideByFor({ contestedAt, days: 3, timeZone: zurich, closes: '18:00', validUntil })).toEqual(new Date('2026-11-03T17:00:00Z'))
  })

  it('is always after the contest and never more than the promised days and a day later', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 400 * 86_400_000 }), fc.integer({ min: DECISION_PROMISE.minDays, max: DECISION_PROMISE.maxDays }), fc.constantFrom('UTC', zurich, 'America/Los_Angeles', 'Asia/Tokyo'), (offset, days, timeZone) => {
      const at = new Date(Date.UTC(2026, 0, 1) + offset)
      const due = decideByFor({ contestedAt: at, days, timeZone, closes: '18:00', validUntil: null })
      expect(due.getTime()).toBeGreaterThan(at.getTime())
      expect(due.getTime() - at.getTime()).toBeLessThanOrEqual((days + 1) * 86_400_000 + 3_600_000)
    }))
  })
})

describe('the shop setting', () => {
  it('takes whole days from one to fourteen', () => {
    expect(checkPromiseDays(3)).toEqual({ ok: true, value: 3 })
    for (const days of [0, 15, 2.5, -1, Number.NaN]) expect(checkPromiseDays(days).ok).toBe(false)
  })
})

describe('where a promise stands', () => {
  const decideBy = new Date('2026-11-03T17:00:00Z')
  const open = { decideBy, decidedAt: null, promiseMissedAt: null }

  it('is open until the date, and kept when decided by it', () => {
    expect(promiseStanding({ decideBy: null, decidedAt: null, promiseMissedAt: null }, contestedAt)).toBe('none')
    expect(promiseStanding(open, new Date('2026-11-03T16:59:00Z'))).toBe('open')
    expect(promiseStanding({ ...open, decidedAt: new Date('2026-11-03T16:00:00Z') }, new Date('2026-11-09T00:00:00Z'))).toBe('kept')
  })

  it('is missed once the date passes undecided, recorded or not, and stays missed when decided late', () => {
    expect(promiseStanding(open, decideBy)).toBe('missed')
    expect(promiseStanding({ ...open, promiseMissedAt: decideBy }, decideBy)).toBe('missed')
    expect(promiseStanding({ ...open, decidedAt: new Date('2026-11-04T09:00:00Z'), promiseMissedAt: decideBy }, new Date('2026-11-05T00:00:00Z'))).toBe('missed')
  })

  it('is due soon in its last day', () => {
    expect(promiseDueSoon(open, new Date('2026-11-02T17:00:00Z'))).toBe(true)
    expect(promiseDueSoon(open, new Date('2026-11-02T16:59:00Z'))).toBe(false)
    expect(promiseDueSoon(open, decideBy)).toBe(false)
    expect(promiseDueSoon({ ...open, decidedAt: contestedAt }, new Date('2026-11-03T09:00:00Z'))).toBe(false)
  })
})

describe('a missed promise', () => {
  it('waives an uncharged claim only under the owner rule, and otherwise sends it to the owner', () => {
    for (const state of ['contested', 'negotiating', 'agreed', 'escalated'] as const) {
      expect(missedPromiseOutcome(state, true)).toBe('waive')
      expect(missedPromiseOutcome(state, false)).toBe('escalate')
    }
  })

  it('never waives a claim already charged to protect an expiring hold: the owner decides it', () => {
    for (const state of ['charging', 'charged', 'charge_failed'] as const) expect(missedPromiseOutcome(state, true)).toBe('escalate')
  })
})
