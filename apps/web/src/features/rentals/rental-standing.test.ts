import { describe, expect, it } from 'vitest'
import { partOf } from './rental-standing'

describe('which part of its life a rental is in', () => {
  it('counts an item a renter dropped off as returned, to be checked with the others that came back', () => {
    expect(partOf({ state: 'dropped_off', paymentLapsed: false })).toBe('returned')
  })
})
