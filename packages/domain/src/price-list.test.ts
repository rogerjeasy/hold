import { describe, expect, it } from 'vitest'
import { money } from './money.ts'
import { checkPriceList, priceCode, publishedText } from './price-list.ts'
import type { PriceListDraft } from './price-list.ts'

const chf = (cents: number) => money(cents, 'CHF')
const draft: PriceListDraft = {
  currency: 'CHF',
  entries: [
    { description: 'Deep scratch on the frame', category: 'damage', amount: chf(35_00) },
    { description: 'Lost lock', category: 'loss', amount: chf(45_00) },
  ],
  wearPolicy: 'Light scuffs on the tyres are ordinary wear.',
}

describe('a price list', () => {
  it('is accepted with priced entries and a wear policy', () => {
    expect(checkPriceList(draft)).toEqual([])
  })

  it('names every problem, by entry', () => {
    expect(
      checkPriceList({
        currency: 'CHF',
        entries: [
          { description: ' ', category: 'damage', amount: chf(10_00) },
          { description: 'Lost lock', category: 'loss', amount: chf(0) },
          { description: 'lost lock', category: 'loss', amount: money(5_00, 'EUR') },
        ],
        wearPolicy: '',
      }),
    ).toEqual([
      { kind: 'description_missing', entry: 0 },
      { kind: 'amount_zero', entry: 1 },
      { kind: 'description_repeated', entry: 2 },
      { kind: 'wrong_currency', entry: 2 },
      { kind: 'wear_policy_missing' },
    ])
  })

  it('needs at least one price', () => {
    expect(checkPriceList({ ...draft, entries: [] })).toEqual([{ kind: 'no_entries' }])
  })

  it('gives each entry a plain code', () => {
    expect(priceCode('Déchirure de la selle', 0)).toBe('dechirure-de-la-selle')
    expect(priceCode('!!!', 3)).toBe('entry-4')
  })

  it('writes the text a renter reads', () => {
    expect(publishedText(draft)).toBe('Deep scratch on the frame: 35.00 CHF\nLost lock: 45.00 CHF')
  })
})
