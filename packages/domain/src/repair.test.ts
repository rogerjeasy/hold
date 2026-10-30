import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { checkRepairClose, priceRepairStanding, REPAIR_LIMITS, REPAIR_TRANSITIONS, repairViews } from './repair.ts'

const line = (id: string, view: string | null) => ({ id, view })

describe('a repair', () => {
  it('opens and is closed once, never reopened', () => {
    expect(REPAIR_TRANSITIONS).toEqual({ open: ['done'], done: [] })
  })

  it('asks for a photograph of each view that has a mark, once each, and none for a line with no mark', () => {
    expect(repairViews([line('a', 'left-side'), line('b', 'left-side'), line('c', 'battery'), line('d', null)])).toEqual(['left-side', 'battery'])
  })
})

describe('closing a repair', () => {
  const lines = [line('a', 'left-side'), line('b', null)]

  it('needs an outcome for every line and a whole, non-negative cost', () => {
    expect(checkRepairClose({ lines, outcomes: { a: 'repaired', b: 'left' }, costCents: 62_00, note: ' Touched up. ' })).toEqual({ ok: true, value: { outcomes: { a: 'repaired', b: 'left' }, costCents: 62_00, note: 'Touched up.' } })
    expect(checkRepairClose({ lines, outcomes: { a: 'repaired' }, costCents: 0, note: '' })).toEqual({ ok: false, error: 'outcome_missing' })
    expect(checkRepairClose({ lines, outcomes: { a: 'repaired', b: 'left', z: 'left' }, costCents: 0, note: '' })).toEqual({ ok: false, error: 'outcome_missing' })
    for (const costCents of [-1, 1.5, Number.NaN, REPAIR_LIMITS.maxCostCents + 1]) expect(checkRepairClose({ lines, outcomes: { a: 'left', b: 'left' }, costCents, note: '' })).toEqual({ ok: false, error: 'cost_invalid' })
    expect(checkRepairClose({ lines, outcomes: { a: 'left', b: 'left' }, costCents: 0, note: 'x'.repeat(REPAIR_LIMITS.noteLength + 1) })).toEqual({ ok: false, error: 'note_too_long' })
  })

  it('stores a blank note as none', () => {
    const closed = checkRepairClose({ lines, outcomes: { a: 'left', b: 'left' }, costCents: 0, note: '   ' })
    expect(closed.ok && closed.value.note).toBe(null)
  })
})

describe('whether a price covers what its repairs cost', () => {
  it('compares the price with the average repair, and says nothing before a repair was costed', () => {
    expect(priceRepairStanding(35_00, [])).toEqual({ repairs: 0, averageCents: null, standing: null })
    expect(priceRepairStanding(35_00, [50_00, 66_80])).toEqual({ repairs: 2, averageCents: 58_40, standing: 'below' })
    expect(priceRepairStanding(25_00, [18_00, 18_00])).toEqual({ repairs: 2, averageCents: 18_00, standing: 'covers' })
  })

  it('rounds the average to a whole cent and covers exactly at the price', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000 }), fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 1, maxLength: 20 }), (price, costs) => {
      const result = priceRepairStanding(price, costs)
      expect(Number.isInteger(result.averageCents)).toBe(true)
      expect(result.standing).toBe((result.averageCents ?? 0) <= price ? 'covers' : 'below')
    }))
  })
})
