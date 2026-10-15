import { describe, expect, it } from 'vitest'
import { checkItemType, ITEM_TYPE_LIMITS } from './item-type.ts'
import type { ItemTypeDraft } from './item-type.ts'
import { money } from './money.ts'

const eur = (cents: number) => money(cents, 'EUR')
const draft: ItemTypeDraft = {
  name: 'City e-bike',
  category: 'e_bike',
  currency: 'EUR',
  value: eur(2400_00),
  hold: eur(300_00),
  dayRate: eur(45_00),
  accessories: [
    { name: 'Charger', count: 1 },
    { name: 'Lock', count: 1 },
  ],
  views: [{ label: 'Frame, left side', outline: 'whole_side', required: true }],
}

describe('an item type', () => {
  it('is accepted with a name, its amounts, a kit and a photo plan', () => {
    expect(checkItemType(draft)).toEqual([])
  })

  it('needs a name no longer than the limit', () => {
    expect(checkItemType({ ...draft, name: '  ' })).toEqual([{ kind: 'name_missing' }])
    expect(checkItemType({ ...draft, name: 'x'.repeat(ITEM_TYPE_LIMITS.name + 1) })).toEqual([{ kind: 'name_too_long' }])
  })

  it('needs a value, a hold and a day rate above zero, in the shop’s currency', () => {
    expect(checkItemType({ ...draft, value: eur(0), hold: eur(0), dayRate: money(45_00, 'CHF') })).toEqual([
      { kind: 'value_zero' },
      { kind: 'hold_zero' },
      { kind: 'wrong_currency', field: 'dayRate' },
    ])
  })

  it('never holds more than the item is worth', () => {
    expect(checkItemType({ ...draft, hold: eur(2400_01) })).toEqual([{ kind: 'hold_above_value' }])
    expect(checkItemType({ ...draft, hold: eur(2400_00) })).toEqual([])
  })

  it('names every problem in the kit, by accessory', () => {
    expect(
      checkItemType({
        ...draft,
        accessories: [
          { name: '', count: 1 },
          { name: 'Lock', count: 0 },
          { name: 'lock', count: 1 },
          { name: 'Helmet', count: ITEM_TYPE_LIMITS.accessoryCount + 1 },
        ],
      }),
    ).toEqual([
      { kind: 'accessory_name_missing', accessory: 0 },
      { kind: 'accessory_count_invalid', accessory: 1 },
      { kind: 'accessory_repeated', accessory: 2 },
      { kind: 'accessory_count_invalid', accessory: 3 },
    ])
  })

  it('takes no more accessories than the limit', () => {
    const many = Array.from({ length: ITEM_TYPE_LIMITS.accessories + 1 }, (_, index) => ({ name: `Part ${String(index)}`, count: 1 }))
    expect(checkItemType({ ...draft, accessories: many })).toEqual([{ kind: 'too_many_accessories' }])
  })

  it('includes the photo plan’s problems', () => {
    expect(checkItemType({ ...draft, views: [] })).toEqual([{ kind: 'no_views' }])
  })
})
