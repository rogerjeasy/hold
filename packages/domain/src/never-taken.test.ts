import { describe, expect, it } from 'vitest'
import { money } from './money.ts'
import { neverTaken } from './never-taken.ts'

const eur = (cents: number) => money(cents, 'EUR')

describe('deposits never taken from a renter', () => {
  it('adds each hold released with no capture, once per rental', () => {
    expect(
      neverTaken([
        { rental: 'a', kind: 'hold_released', amount: eur(300_00) },
        { rental: 'b', kind: 'hold_released', amount: eur(150_00) },
        { rental: 'b', kind: 'fee_captured', amount: eur(40_00) },
      ]),
    ).toEqual([{ amount: eur(450_00), rentals: 2 }])
  })

  it('leaves out a rental whose hold was captured, even in part', () => {
    expect(
      neverTaken([
        { rental: 'a', kind: 'hold_captured', amount: eur(80_00) },
        { rental: 'a', kind: 'hold_released', amount: eur(220_00) },
      ]),
    ).toEqual([])
  })

  it('counts a hold once when a replacement released the authorization before it', () => {
    expect(
      neverTaken([
        { rental: 'a', kind: 'hold_released', amount: eur(300_00) },
        { rental: 'a', kind: 'hold_released', amount: eur(300_00) },
      ]),
    ).toEqual([{ amount: eur(300_00), rentals: 1 }])
  })

  it('keeps each currency apart', () => {
    expect(
      neverTaken([
        { rental: 'a', kind: 'hold_released', amount: eur(300_00) },
        { rental: 'b', kind: 'hold_released', amount: money(200_00, 'CHF') },
      ]),
    ).toEqual([
      { amount: money(200_00, 'CHF'), rentals: 1 },
      { amount: eur(300_00), rentals: 1 },
    ])
  })
})
