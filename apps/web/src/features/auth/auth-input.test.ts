import { describe, expect, it } from 'vitest'
import { parseAuthInput, signInFields, signUpFields } from './auth-input'

describe('parseAuthInput', () => {
  it('accepts an email address and trims the space around it', () => {
    expect(parseAuthInput(signInFields, { email: '  tomas@ribeirabikes.example ' })).toEqual({
      ok: true,
      value: { email: 'tomas@ribeirabikes.example' },
    })
  })

  it.each(['', '   ', undefined, null, 42])('says the email is missing when it is %j', (email) => {
    expect(parseAuthInput(signInFields, { email })).toEqual({ ok: false, problems: { email: 'missing' } })
  })

  it.each(['tomas', 'tomas@', '@ribeirabikes.example', 'tomas@ribeirabikes', 'to mas@ribeirabikes.example', `${'a'.repeat(250)}@b.example`])(
    'refuses %j as an email address',
    (email) => {
      expect(parseAuthInput(signInFields, { email })).toEqual({ ok: false, problems: { email: 'invalid' } })
    },
  )

  it('asks a new owner for a name, a shop name and an email address', () => {
    expect(parseAuthInput(signUpFields, {})).toEqual({
      ok: false,
      problems: { name: 'missing', shopName: 'missing', email: 'missing' },
    })
  })

  it('refuses a name longer than 100 characters', () => {
    const input = { name: 'a'.repeat(101), shopName: 'Ribeira Bikes', email: 'tomas@ribeirabikes.example' }
    expect(parseAuthInput(signUpFields, input)).toEqual({ ok: false, problems: { name: 'invalid' } })
  })

  it('returns only the fields it was asked for', () => {
    const input = { name: 'Tomás', shopName: 'Ribeira Bikes', email: 'tomas@ribeirabikes.example', role: 'owner', $ACTION_ID: 'x' }
    expect(parseAuthInput(signUpFields, input)).toEqual({
      ok: true,
      value: { name: 'Tomás', shopName: 'Ribeira Bikes', email: 'tomas@ribeirabikes.example' },
    })
  })
})
