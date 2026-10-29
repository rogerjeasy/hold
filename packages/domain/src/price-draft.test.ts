import { describe, expect, it } from 'vitest'
import { checkPriceRows, diffPriceLists, draftCodes } from './price-draft.ts'

// The price list as a shop edits it, row by row, before it is published (extensions.md section 12.5): each cell
// checked by the rules publishing applies, and what changed between two versions a renter may have agreed to.

describe('checking a draft row by row', () => {
  const row = (description: string, amount: string) => ({ description, amount })

  it('accepts a described row with a whole amount in the shop’s currency', () => {
    expect(checkPriceRows([row('Deep scratch on the frame', '35'), row('Lost lock', '45.50')], 'EUR')).toEqual([{}, {}])
  })

  it('names the problem in each cell: an amount that is not money, or nothing, a missing or repeated description', () => {
    expect(checkPriceRows([row('', '35'), row('Lost lock', 'thirty'), row('lost lock ', '0'), row('Bent wheel', '12.345')], 'EUR')).toEqual([
      { description: 'description_missing' },
      { amount: 'amount_invalid' },
      { description: 'description_repeated', amount: 'amount_zero' },
      { amount: 'amount_invalid' },
    ])
  })

  it('takes no cents in a currency that has none', () => {
    expect(checkPriceRows([row('Lost lock', '4500'), row('Bent wheel', '12.50')], 'JPY')).toEqual([{}, { amount: 'amount_invalid' }])
  })

  it('refuses a description longer than a renter can read in one line', () => {
    expect(checkPriceRows([row('x'.repeat(121), '5')], 'EUR')).toEqual([{ description: 'description_too_long' }])
  })
})

describe('what changed between two versions', () => {
  const entry = (description: string, amountCents: number, category: 'damage' | 'loss' = 'damage') => ({ description, category, amountCents })

  it('matches entries by their code and lists what was added, removed and changed, and whether the wear policy changed', () => {
    const before = { entries: [entry('Deep scratch on the frame', 3500), entry('Lost lock', 4500, 'loss'), entry('Bent wheel', 9000)], wearPolicy: 'Scuffs are wear.' }
    const after = { entries: [entry('Deep scratch on the frame', 4000), entry('Lost lock', 4500, 'loss'), entry('Missing charger', 6000, 'loss')], wearPolicy: 'Scuffs are wear.' }
    expect(diffPriceLists(before, after)).toEqual({
      added: [{ code: 'missing-charger', description: 'Missing charger', category: 'loss', amountCents: 6000 }],
      removed: [{ code: 'bent-wheel', description: 'Bent wheel', category: 'damage', amountCents: 9000 }],
      changed: [{ code: 'deep-scratch-on-the-frame', description: 'Deep scratch on the frame', from: { category: 'damage', amountCents: 3500 }, to: { category: 'damage', amountCents: 4000 } }],
      unchanged: 1,
      wearPolicyChanged: false,
    })
  })

  it('says when only the wear policy changed', () => {
    const list = { entries: [entry('Lost lock', 4500, 'loss')], wearPolicy: 'Scuffs are wear.' }
    expect(diffPriceLists(list, { ...list, wearPolicy: 'Scuffs and dust are wear.' })).toMatchObject({ added: [], removed: [], changed: [], unchanged: 1, wearPolicyChanged: true })
  })

  it('codes a draft’s entries the way publishing will, a repeated code numbered', () => {
    expect(draftCodes(['Deep scratch', 'Deep scratch!', ''])).toEqual(['deep-scratch', 'deep-scratch-2', 'entry-3'])
  })
})
