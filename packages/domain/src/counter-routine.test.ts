import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { counterRoutine } from './counter-routine.ts'

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 28, 10) + seconds * 1000)
const session = (kind: 'handover' | 'return', seconds: number | null, simulated = false) => ({ kind, startedAt: at(0), sealedAt: seconds === null ? null : at(seconds), simulated })

// project-description.md section 13: "time taken for handover and return", measured, never claimed.
describe('the counter routine', () => {
  it('is the median time from opening a handover or a return to sealing it, with its count', () => {
    expect(counterRoutine([session('handover', 40), session('handover', 70), session('handover', 50), session('return', 90), session('return', 60)])).toEqual({
      handover: { medianSeconds: 50, count: 3 },
      return: { medianSeconds: 75, count: 2 },
    })
  })

  it('leaves out a session not sealed yet, one with the demonstration’s sample photographs, and other kinds', () => {
    expect(counterRoutine([session('handover', null), session('handover', 5, true), { ...session('handover', 30), kind: 'incident' as const }, session('handover', 45)])).toEqual({
      handover: { medianSeconds: 45, count: 1 },
      return: { medianSeconds: null, count: 0 },
    })
  })

  it('says nothing about a kind with no session, rather than a time of zero', () => {
    expect(counterRoutine([])).toEqual({ handover: { medianSeconds: null, count: 0 }, return: { medianSeconds: null, count: 0 } })
  })

  it('always lies between the quickest and the slowest session it counts', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 3600 }), { minLength: 1, maxLength: 30 }), (times) => {
      const { handover } = counterRoutine(times.map((seconds) => session('handover', seconds)))
      expect(handover.count).toBe(times.length)
      expect(handover.medianSeconds).toBeGreaterThanOrEqual(Math.min(...times))
      expect(handover.medianSeconds).toBeLessThanOrEqual(Math.max(...times))
    }))
  })
})
