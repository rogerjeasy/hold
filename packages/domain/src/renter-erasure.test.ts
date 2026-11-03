import { describe, expect, it } from 'vitest'
import { checkRenterErasure, ERASED } from './renter-erasure.ts'
import { RENTAL_ENDED_STATES, RENTAL_STATES } from './rental.ts'

describe('erasing a renter’s personal details', () => {
  it('is allowed once every one of their rentals in the shop has ended', () => {
    expect(checkRenterErasure([{ state: 'closed', erased: false }, { state: 'cancelled', erased: false }, { state: 'abandoned', erased: false }])).toEqual({ ok: true, value: undefined })
  })

  it('waits while any rental in the shop is still open', () => {
    for (const state of RENTAL_STATES.filter((each) => !RENTAL_ENDED_STATES.includes(each))) {
      expect(checkRenterErasure([{ state: 'closed', erased: false }, { state, erased: false }])).toEqual({ ok: false, error: 'rental_open' })
    }
  })

  it('cannot be done twice', () => {
    expect(checkRenterErasure([{ state: 'closed', erased: true }, { state: 'abandoned', erased: true }])).toEqual({ ok: false, error: 'already_erased' })
  })

  it('takes in a rental that ended after an earlier erasure', () => {
    expect(checkRenterErasure([{ state: 'closed', erased: true }, { state: 'closed', erased: false }])).toEqual({ ok: true, value: undefined })
  })

  it('needs a rental to erase', () => {
    expect(checkRenterErasure([])).toEqual({ ok: false, error: 'not_found' })
  })

  it('leaves a marker no person could be named or reached by', () => {
    expect(ERASED).not.toMatch(/@|\d/)
  })
})

describe('the states in which a rental has ended', () => {
  it('are the rental machine’s final states', () => {
    expect([...RENTAL_ENDED_STATES].sort()).toEqual(['abandoned', 'cancelled', 'closed'])
  })
})
