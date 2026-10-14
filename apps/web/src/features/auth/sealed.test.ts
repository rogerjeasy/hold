// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readAttempt } from './attempt'
import { seal, unseal } from './sealed'

const KEY = Buffer.alloc(32, 1)
const ATTEMPT = { page: 'signIn', step: 'answer_sign_in', email: 'tomas@ribeirabikes.example', session: 's', language: 'en', expiresAt: 2_000 }

describe('a sealed cookie', () => {
  it('opens to what was sealed, with the same key', () => {
    expect(unseal(seal(ATTEMPT, KEY), KEY)).toEqual(ATTEMPT)
  })

  it('cannot be read in the browser', () => {
    expect(seal(ATTEMPT, KEY)).not.toContain('tomas')
  })

  it('opens to nothing once changed, or with another key', () => {
    const sealed = seal(ATTEMPT, KEY)
    const changed = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`
    expect(unseal(changed, KEY)).toBeUndefined()
    expect(unseal(sealed, Buffer.alloc(32, 2))).toBeUndefined()
    expect(unseal('not sealed at all', KEY)).toBeUndefined()
  })
})

describe('an attempt read from a cookie', () => {
  it('is kept until it lapses', () => {
    expect(readAttempt(ATTEMPT, new Date(1_999))).toEqual(ATTEMPT)
    expect(readAttempt(ATTEMPT, new Date(2_000))).toBeUndefined()
  })

  it('is refused with a field it should not have', () => {
    expect(readAttempt({ ...ATTEMPT, admin: true }, new Date(0))).toBeUndefined()
  })
})
