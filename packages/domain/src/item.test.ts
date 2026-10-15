import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { bindingRental, changeItemStatus, checkItem, ITEM_LIMITS, ITEM_STATUSES, itemStanding, nextItemLabels } from './item.ts'
import { RENTAL_STATES } from './rental.ts'

describe('where an item stands', () => {
  it('is available with no rental under way', () => {
    expect(itemStanding('in_service', undefined)).toBe('available')
    expect(itemStanding('in_service', 'closed')).toBe('available')
  })

  it('follows the rental it is in', () => {
    expect(itemStanding('in_service', 'booked')).toBe('booked')
    expect(itemStanding('in_service', 'ready')).toBe('booked')
    expect(itemStanding('in_service', 'out')).toBe('out')
    expect(itemStanding('in_service', 'overdue')).toBe('overdue')
    expect(itemStanding('in_service', 'inspecting')).toBe('checking')
  })

  it('shows repair and retirement first, whatever the rental', () => {
    expect(itemStanding('in_repair', 'booked')).toBe('in_repair')
    expect(itemStanding('retired', undefined)).toBe('retired')
  })
})

describe('the rental that decides where an item stands', () => {
  it('is the one a renter has, then one being checked, then a booking, then none', () => {
    expect(bindingRental(['booked', 'out', 'closed'])).toBe('out')
    expect(bindingRental(['ready', 'inspecting'])).toBe('inspecting')
    expect(bindingRental(['settling', 'awaiting_hold'])).toBe('awaiting_hold')
    expect(bindingRental(['closed', 'cancelled'])).toBeUndefined()
    expect(bindingRental([])).toBeUndefined()
  })
})

describe('changing an item’s status', () => {
  it('sends an item to repair and back', () => {
    expect(changeItemStatus({ from: 'in_service', to: 'in_repair', rental: undefined })).toEqual({ ok: true, value: 'in_repair' })
    expect(changeItemStatus({ from: 'in_repair', to: 'in_service', rental: 'closed' })).toEqual({ ok: true, value: 'in_service' })
  })

  it('never brings a retired item back', () => {
    expect(changeItemStatus({ from: 'retired', to: 'in_service', rental: undefined })).toEqual({ ok: false, error: { kind: 'transition_not_allowed', from: 'retired', to: 'in_service' } })
  })

  it('refuses repair while a renter has the item', () => {
    expect(changeItemStatus({ from: 'in_service', to: 'in_repair', rental: 'out' })).toEqual({ ok: false, error: { kind: 'with_renter' } })
    expect(changeItemStatus({ from: 'in_service', to: 'in_repair', rental: 'inspecting' })).toEqual({ ok: true, value: 'in_repair' })
  })

  it('refuses retirement while any rental of the item is under way', () => {
    expect(changeItemStatus({ from: 'in_service', to: 'retired', rental: 'booked' })).toEqual({ ok: false, error: { kind: 'rental_under_way' } })
    expect(changeItemStatus({ from: 'in_repair', to: 'retired', rental: 'cancelled' })).toEqual({ ok: true, value: 'retired' })
  })

  it('never retires an item a rental still depends on, for any rental state', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_STATUSES), fc.constantFrom(...RENTAL_STATES), (from, rental) => {
        const result = changeItemStatus({ from, to: 'retired', rental })
        const settled = rental === 'closed' || rental === 'cancelled' || rental === 'abandoned' || rental === 'settling'
        if (result.ok) expect(settled).toBe(true)
      }),
    )
  })
})

describe('numbering new items', () => {
  it('counts on from the highest number the shop already uses for that name', () => {
    expect(nextItemLabels('E-bike', ['E-bike 1', 'E-bike 4', 'e-bike 2', 'Gravel bike 9', 'E-bike spare'], 2)).toEqual(['E-bike 5', 'E-bike 6'])
  })

  it('starts at one', () => {
    expect(nextItemLabels(' Tandem kayak ', [], 1)).toEqual(['Tandem kayak 1'])
  })
})

describe('an item', () => {
  it('needs a label, and keeps size and serial short', () => {
    expect(checkItem({ label: 'E-bike 14', size: 'M', serial: 'WTU123' })).toEqual([])
    expect(checkItem({ label: ' ', size: 'x'.repeat(ITEM_LIMITS.size + 1), serial: 'x'.repeat(ITEM_LIMITS.serial + 1) })).toEqual([
      { kind: 'label_missing' },
      { kind: 'size_too_long' },
      { kind: 'serial_too_long' },
    ])
  })
})
