import { describe, expect, it } from 'vitest'
import type { Attempt } from '../identity.ts'
import { createFakeIdentity } from './fake-identity.ts'

const EMAIL = 'tomas@ribeirabikes.example'

function value<Value>(result: { ok: true; value: Value } | { ok: false }): Value {
  if (!result.ok) throw new Error('Expected success.')
  return result.value
}

describe('the fake identity', () => {
  it('signs a new person up, confirms the address and signs them in with no second code', async () => {
    const identity = createFakeIdentity()
    const started = value(await identity.signUp(EMAIL))
    const confirmed = value(await identity.confirmSignUp(EMAIL, identity.lastCodeFor(EMAIL) ?? '', started))
    if (confirmed === undefined) throw new Error('Expected an attempt.')

    const tokens = value(await identity.signInAfterSignUp(EMAIL, confirmed))
    expect(value(await identity.verifyAccessToken(tokens.accessToken)).subject).toMatch(/[0-9a-f-]{36}/)
  })

  it('signs a confirmed person in with the emailed code, used once', async () => {
    const identity = createFakeIdentity({ fixedCode: '24681357' })
    await identity.signUp(EMAIL)
    await identity.confirmSignUp(EMAIL, '24681357', undefined)
    const started = value(await identity.startSignIn(EMAIL))

    expect((await identity.answerSignInCode(EMAIL, '24681357', started)).ok).toBe(true)
    expect(await identity.answerSignInCode(EMAIL, '24681357', started)).toMatchObject({ ok: false, error: { kind: 'attempt_expired' } })
  })

  it('ends an attempt after three wrong codes', async () => {
    const identity = createFakeIdentity()
    await identity.signUp(EMAIL)
    await identity.confirmSignUp(EMAIL, identity.lastCodeFor(EMAIL) ?? '', undefined)
    const started: Attempt = value(await identity.startSignIn(EMAIL))
    const right = identity.lastCodeFor(EMAIL) ?? ''

    for (let wrong = 0; wrong < 3; wrong += 1) await identity.answerSignInCode(EMAIL, '00000000', started)
    expect(await identity.answerSignInCode(EMAIL, right, started)).toMatchObject({ ok: false, error: { kind: 'attempt_expired' } })
  })

  it('ends an attempt after ten minutes', async () => {
    let now = new Date('2026-10-14T09:00:00Z')
    const identity = createFakeIdentity({ now: () => now })
    await identity.signUp(EMAIL)
    await identity.confirmSignUp(EMAIL, identity.lastCodeFor(EMAIL) ?? '', undefined)
    const started = value(await identity.startSignIn(EMAIL))
    now = new Date('2026-10-14T09:10:00Z')

    expect(await identity.answerSignInCode(EMAIL, identity.lastCodeFor(EMAIL) ?? '', started)).toMatchObject({ ok: false, error: { kind: 'attempt_expired' } })
  })

  it('answers an address with no account the same way, and sends it nothing', async () => {
    const identity = createFakeIdentity()

    expect((await identity.startSignIn('nobody@shop.example')).ok).toBe(true)
    expect(identity.lastCodeFor('nobody@shop.example')).toBeUndefined()
  })

  it('refuses a refresh token after sign-out', async () => {
    const identity = createFakeIdentity({ fixedCode: '11111111' })
    await identity.signUp(EMAIL)
    await identity.confirmSignUp(EMAIL, '11111111', undefined)
    const tokens = value(await identity.answerSignInCode(EMAIL, '11111111', value(await identity.startSignIn(EMAIL))))
    await identity.signOut(tokens.refreshToken ?? '')

    expect(await identity.refresh(tokens.refreshToken ?? '')).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })
})

describe('passkeys in the fake identity', () => {
  async function signedInOwner() {
    const identity = createFakeIdentity({ fixedCode: '11111111' })
    await identity.signUp(EMAIL)
    await identity.confirmSignUp(EMAIL, '11111111', undefined)
    const tokens = value(await identity.answerSignInCode(EMAIL, '11111111', value(await identity.startSignIn(EMAIL))))
    return { identity, accessToken: tokens.accessToken }
  }

  it('registers a passkey made for localhost, with user verification required', async () => {
    const { identity, accessToken } = await signedInOwner()
    const options = JSON.parse(value(await identity.startPasskeyRegistration(accessToken)).creationOptions) as Record<string, unknown>
    expect(options).toMatchObject({ rp: { id: 'localhost' }, authenticatorSelection: { userVerification: 'required' } })

    await identity.finishPasskeyRegistration(accessToken, JSON.stringify({ id: 'credential-1', type: 'public-key' }))
    expect(value(await identity.listPasskeys(accessToken)).map((passkey) => passkey.id)).toEqual(['credential-1'])
  })

  it('signs in with a passkey it registered, and refuses any other', async () => {
    const { identity, accessToken } = await signedInOwner()
    await identity.finishPasskeyRegistration(accessToken, JSON.stringify({ id: 'credential-1' }))

    const started = value(await identity.startPasskeySignIn(EMAIL))
    expect(JSON.parse(started.requestOptions)).toMatchObject({ allowCredentials: [{ id: 'credential-1' }] })
    expect((await identity.answerPasskey(EMAIL, JSON.stringify({ id: 'credential-1' }), started)).ok).toBe(true)

    const again = value(await identity.startPasskeySignIn(EMAIL))
    expect(await identity.answerPasskey(EMAIL, JSON.stringify({ id: 'stolen' }), again)).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })

  it('says an address has no passkey', async () => {
    expect(await createFakeIdentity().startPasskeySignIn('nobody@shop.example')).toMatchObject({ ok: false, error: { kind: 'no_passkey' } })
  })
})

describe('demo accounts in the fake identity', () => {
  it('signs a demo account in with its password and no code', async () => {
    const identity = createFakeIdentity()
    const subject = identity.addDemoAccount('demo-owner@hold.example', 'secret-password')

    const tokens = value(await identity.signInWithPassword('demo-owner@hold.example', 'secret-password'))

    expect(value(await identity.verifyAccessToken(tokens.accessToken)).subject).toBe(subject)
    expect(identity.lastCodeFor('demo-owner@hold.example')).toBeUndefined()
  })

  it('refuses a wrong password, and any password for an account that has none', async () => {
    const identity = createFakeIdentity({ fixedCode: '24681357' })
    identity.addDemoAccount('demo-owner@hold.example', 'secret-password')
    value(await identity.signUp(EMAIL))
    value(await identity.confirmSignUp(EMAIL, '24681357', undefined))

    expect(await identity.signInWithPassword('demo-owner@hold.example', 'wrong')).toMatchObject({ ok: false, error: { kind: 'rejected' } })
    expect(await identity.signInWithPassword(EMAIL, '')).toMatchObject({ ok: false, error: { kind: 'rejected' } })
    expect(await identity.signInWithPassword('nobody@shop.example', 'secret-password')).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })
})
