// @vitest-environment node
import type { FakeIdentity } from '@hold/auth'
import { describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 5).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (name: string) => jar.delete(name),
    }),
  headers: () => Promise.resolve(new Headers()),
}))

const { startPasskeyRegistration, finishPasskeyRegistration } = await import('./actions')
const { writeSession } = await import('./session-cookies')
const { getServices, TEST_SIGN_IN_CODE } = await import('@/server/services')

vi.setConfig({ testTimeout: 30_000 })

async function signIn(email: string, factor: 'email_code' | 'passkey') {
  const identity = (await getServices()).identity as FakeIdentity
  if ((await identity.signUp(email)).ok) await identity.confirmSignUp(email, TEST_SIGN_IN_CODE, undefined)
  const started = await identity.startSignIn(email)
  if (!started.ok) throw new Error('No sign-in.')
  const tokens = await identity.answerSignInCode(email, TEST_SIGN_IN_CODE, started.value)
  if (!tokens.ok) throw new Error('No tokens.')
  jar.clear()
  await writeSession(tokens.value, factor)
}

describe('adding a passkey', () => {
  it('lets a person add their first from a session an emailed code proved', async () => {
    await signIn('first@shop.example', 'email_code')
    expect((await startPasskeyRegistration()).creationOptions).toBeDefined()
    expect(await finishPasskeyRegistration(JSON.stringify({ id: 'first-key' }))).toEqual({ registered: true })
  })

  it('asks a person who has one to confirm with it before adding another', async () => {
    await signIn('second@shop.example', 'email_code')
    await finishPasskeyRegistration(JSON.stringify({ id: 'own-key' }))

    expect(await startPasskeyRegistration()).toEqual({ problem: 'confirm_first' })
    expect(await finishPasskeyRegistration(JSON.stringify({ id: 'someone-elses-key' }))).toEqual({ problem: 'confirm_first' })

    await signIn('second@shop.example', 'passkey')
    expect(await finishPasskeyRegistration(JSON.stringify({ id: 'second-key' }))).toEqual({ registered: true })
  })
})
