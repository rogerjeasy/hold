import { describe, expect, it } from 'vitest'
import { cleanAmount, parsePastedPrices } from './paste'

// A shop's existing price list, pasted from a spreadsheet, a document or an email, becomes rows of the draft.
describe('pasting a price list', () => {
  it('reads rows copied from a spreadsheet, skips its header, and finds the amount and the category in any column', () => {
    const pasted = 'What\tKind\tPrice\nDeep scratch on the frame\tDamage\t€35.00\nLost lock\tloss\t45\r\nLate return, per day\t20,00 €\tLateness\n'
    expect(parsePastedPrices(pasted, 'EUR')).toEqual({
      rows: [
        { description: 'Deep scratch on the frame', category: 'damage', amount: '35.00' },
        { description: 'Lost lock', category: 'loss', amount: '45' },
        { description: 'Late return, per day', category: 'lateness', amount: '20.00' },
      ],
      skipped: 1,
    })
  })

  it('reads lines with semicolons, or a price at the end after a comma, and calls a row with no kind damage', () => {
    expect(parsePastedPrices('Bent wheel;90\nMissing charger, 60.00', 'EUR').rows).toEqual([
      { description: 'Bent wheel', category: 'damage', amount: '90' },
      { description: 'Missing charger', category: 'damage', amount: '60.00' },
    ])
  })

  it('keeps a line whose price it cannot read with what was written there, for the shop to fix, and drops blank lines', () => {
    expect(parsePastedPrices('Cracked display\tnot sure\nScratched fork\n\n\t\n', 'EUR').rows).toEqual([
      { description: 'Cracked display', category: 'damage', amount: 'not sure' },
      { description: 'Scratched fork', category: 'damage', amount: '' },
    ])
  })

  it('takes a kind written in the shop’s own language', () => {
    expect(parsePastedPrices('Schloss verloren\tVerlust\t45', 'EUR', { Verlust: 'loss' }).rows).toEqual([{ description: 'Schloss verloren', category: 'loss', amount: '45' }])
  })
})

describe('cleaning an amount as people write it', () => {
  it('drops currency signs and codes, and reads the last separator as the decimal one', () => {
    expect(['€35', '35 EUR', 'CHF 1’200.50', '1.234,50', '1,234.50', '1 200', '35,5', '1,200'].map(cleanAmount)).toEqual(['35', '35', '1200.50', '1234.50', '1234.50', '1200', '35.5', '1200'])
  })
})
