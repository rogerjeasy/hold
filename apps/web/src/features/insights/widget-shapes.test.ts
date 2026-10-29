import { describe, expect, it } from 'vitest'
import { lifeSegments, waterfallSteps } from './widget-shapes'

// The shapes of the insights dashboard's own widgets (extensions.md section 12.5): a hold's 29-day line, and the
// settlement waterfall that shows captured plus released never exceeds what was reserved.

describe('a hold’s 29-day line', () => {
  it('marks the days its capture is assured, the days it is valid, the days it is ending, and today', () => {
    expect(lifeSegments({ day: 14, days: 29, assuredDays: 3 })).toEqual({
      segments: [{ kind: 'assured', from: 0, to: 3 / 29 }, { kind: 'valid', from: 3 / 29, to: 26 / 29 }, { kind: 'ending', from: 26 / 29, to: 1 }],
      today: 13.5 / 29,
    })
  })

  it('keeps today on the line whatever day it is', () => {
    expect(lifeSegments({ day: 40, days: 29, assuredDays: 3 }).today).toBe(28.5 / 29)
    expect(lifeSegments({ day: 0, days: 29, assuredDays: 3 }).today).toBe(0.5 / 29)
  })
})

describe('the settlement waterfall', () => {
  it('steps down from what was reserved by what was captured and released, to what is still held', () => {
    expect(waterfallSteps({ reservedCents: 1000_00, capturedCents: 35_00, releasedCents: 215_00 })).toEqual({
      steps: [
        { kind: 'reserved', cents: 1000_00, from: 0, to: 1 },
        { kind: 'captured', cents: 35_00, from: 0.965, to: 1 },
        { kind: 'released', cents: 215_00, from: 0.75, to: 0.965 },
        { kind: 'held', cents: 750_00, from: 0, to: 0.75 },
      ],
      withinHold: true,
    })
  })

  it('says when captured and released together pass what was reserved, and draws nothing below nought', () => {
    const over = waterfallSteps({ reservedCents: 100_00, capturedCents: 80_00, releasedCents: 50_00 })
    expect(over.withinHold).toBe(false)
    expect(over.steps.at(-1)).toEqual({ kind: 'held', cents: 0, from: 0, to: 0 })
    expect(waterfallSteps({ reservedCents: 0, capturedCents: 0, releasedCents: 0 }).steps.every((step) => step.from === 0 && step.to === 0)).toBe(true)
  })

  it('keeps every step on the bar, whatever the amounts', () => {
    const cases = [[100_00, 0, 0], [100_00, 100_00, 0], [100_00, 0, 100_00], [100_00, 250_00, 0], [100_00, 30_00, 900_00], [1, 1, 1], [0, 50_00, 50_00]] as const
    for (const [reservedCents, capturedCents, releasedCents] of cases) {
      for (const step of waterfallSteps({ reservedCents, capturedCents, releasedCents }).steps) {
        expect(step.from).toBeGreaterThanOrEqual(0)
        expect(step.to).toBeLessThanOrEqual(1)
        expect(step.from).toBeLessThanOrEqual(step.to)
      }
    }
  })
})
