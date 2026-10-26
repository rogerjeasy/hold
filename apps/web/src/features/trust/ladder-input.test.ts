import { money } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { ladderFields, readLadder } from './ladder-input'

const eur = (cents: number) => money(cents, 'EUR')
const form = {
  history: 'network',
  windowMonths: '24',
  minimumFee: '10',
  minimumHours: '4',
  cleanReturns: ['3', '5'],
  share: ['75', '50'],
  largestValue: ['2000', ''],
  savedMethod: ['no', 'no'],
  locale: 'en',
}

describe('a ladder as the owner types it', () => {
  it('is read into whole numbers and amounts in the shop’s currency', () => {
    expect(readLadder(ladderFields.parse(form), 'EUR')).toEqual({
      ok: true,
      value: {
        currency: 'EUR',
        history: 'network',
        windowMonths: 24,
        minimumFee: eur(10_00),
        minimumHours: 4,
        rungs: [
          { cleanReturns: 3, sharePercent: 75, largestValue: eur(2000_00), needsSavedMethod: false },
          { cleanReturns: 5, sharePercent: 50, largestValue: undefined, needsSavedMethod: false },
        ],
      },
    })
  })

  it('names the rung whose value is not an amount', () => {
    expect(readLadder(ladderFields.parse({ ...form, largestValue: ['2000', 'lots'] }), 'EUR')).toEqual({ ok: false, error: 'cover_amount_invalid:1' })
  })

  it('refuses rows that do not line up, a minimum fee that is not an amount, and numbers that are not whole', () => {
    expect(readLadder(ladderFields.parse({ ...form, share: ['75'] }), 'EUR')).toEqual({ ok: false, error: 'rows_mismatched' })
    expect(readLadder(ladderFields.parse({ ...form, minimumFee: 'ten' }), 'EUR')).toEqual({ ok: false, error: 'minimum_fee_invalid' })
    expect(readLadder(ladderFields.parse({ ...form, cleanReturns: ['3.5', '5'] }), 'EUR')).toEqual({ ok: false, error: 'clean_returns_invalid:0' })
  })

  it('passes the ladder’s own problems on, by rung', () => {
    expect(readLadder(ladderFields.parse({ ...form, share: ['50', '75'] }), 'EUR')).toEqual({ ok: false, error: 'share_not_falling:1' })
  })

  it('takes a ladder with no rungs, which keeps every hold ordinary', () => {
    expect(readLadder(ladderFields.parse({ ...form, cleanReturns: [], share: [], largestValue: [], savedMethod: [] }), 'EUR')).toMatchObject({ ok: true, value: { rungs: [] } })
  })
})
