// @vitest-environment node
import { acceptInvitation, auditLog, createInvitation, inShop, registerOwner } from '@hold/db'
import type { FakeIdentity } from '@hold/auth'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The test environment's services: the fake identity, a database in memory and a mailer that keeps what it sends.
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

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
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string, values?: Record<string, string>) => `${key} ${JSON.stringify(values ?? {})}`),
}))

const shopActions = await import('@/features/shop/actions')
const { isShopAction } = await import('./shop-access')
const { getServices, TEST_SIGN_IN_CODE } = await import('./services')
const { writeSession } = await import('@/features/auth/session-cookies')

vi.setConfig({ testTimeout: 30_000 })

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

// Signs a person in with the fake identity and keeps their session in the jar, as the browser would.
async function signIn(email: string, factor: 'email_code' | 'passkey') {
  const { identity } = await getServices()
  const fake = identity as FakeIdentity
  if ((await fake.startSignIn(email)).ok && fake.lastCodeFor(email) === undefined) {
    await fake.signUp(email)
    await fake.confirmSignUp(email, TEST_SIGN_IN_CODE, undefined)
  }
  const started = await fake.startSignIn(email)
  if (!started.ok) throw new Error('No sign-in.')
  const tokens = await fake.answerSignInCode(email, TEST_SIGN_IN_CODE, started.value)
  if (!tokens.ok) throw new Error('No tokens.')
  jar.clear()
  await writeSession(tokens.value, factor)
  const verified = await fake.verifyAccessToken(tokens.value.accessToken)
  if (!verified.ok) throw new Error('No subject.')
  return verified.value.subject
}

let shopId: string

beforeAll(async () => {
  const { database } = await getServices()
  const subject = await signIn('owner@douro.example', 'email_code')
  shopId = (await registerOwner(database, { subject, email: 'owner@douro.example', name: 'Owner', language: 'en', shop: { name: 'Douro Bikes', timeZone: 'UTC' } })).shopId
})

beforeEach(() => {
  jar.clear()
})

const invite = { email: 'staff@douro.example', role: 'counter_staff', approvalLimit: '', locale: 'en' }

describe('every shop action', () => {
  it('is built by shopAction, so none skips the checks', () => {
    const exported = Object.entries(shopActions)
    expect(exported.length).toBeGreaterThan(0)
    expect(exported.filter(([, value]) => !isShopAction(value)).map(([name]) => name)).toEqual([])
  })
})

describe('a shop action', () => {
  it('refuses a caller who is not signed in', async () => {
    expect(await shopActions.inviteStaff(null, form(invite))).toEqual({ ok: false, failure: 'signed_out' })
  })

  it('refuses an owner whose session only an emailed code proved', async () => {
    await signIn('owner@douro.example', 'email_code')
    expect(await shopActions.inviteStaff(null, form(invite))).toEqual({ ok: false, failure: 'passkey_needed' })
  })

  it('does not count a passkey record carried over from another account’s session', async () => {
    await signIn('attacker@elsewhere.example', 'passkey')
    const carried = { factor: jar.get('hold_factor'), refresh: jar.get('hold_refresh') }
    await signIn('owner@douro.example', 'email_code')
    jar.set('hold_factor', carried.factor ?? '')
    jar.set('hold_refresh', carried.refresh ?? '')

    expect(await shopActions.inviteStaff(null, form(invite))).toEqual({ ok: false, failure: 'passkey_needed' })
  })

  it('refuses fields it does not know', async () => {
    await signIn('owner@douro.example', 'passkey')
    expect(await shopActions.inviteStaff(null, form({ ...invite, shopId: 'someone-elses' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })

  it('acts for an owner a passkey proved, writes the audit line, and sends the invitation', async () => {
    await signIn('owner@douro.example', 'passkey')
    expect(await shopActions.inviteStaff(null, form(invite))).toEqual({ ok: true, value: { email: 'staff@douro.example' } })

    const { database, mailer } = await getServices()
    expect((mailer as unknown as { sent: { to: string; text: string }[] }).sent.at(-1)).toMatchObject({ to: 'staff@douro.example' })
    const lines = await inShop(database, { role: 'hold_app', shopId }, (transaction) => transaction.select().from(auditLog))
    expect(lines.filter((line) => line.action === 'staff.invited')).toHaveLength(1)
  })

  it('refuses a role that may not do it, even with a passkey', async () => {
    const { database } = await getServices()
    const ownerSubject = await signIn('owner@douro.example', 'passkey')
    const owner = await registerOwner(database, { subject: ownerSubject, email: 'owner@douro.example', name: 'Owner', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'UTC' } })
    const { token } = await inShop(database, { role: 'hold_app', shopId: owner.shopId, userId: owner.userId }, (transaction) =>
      createInvitation(transaction, { shopId: owner.shopId, invitedByUserId: owner.userId, email: 'reader@douro.example', role: 'read_only', approvalLimitCents: 0, language: 'en' }, new Date()),
    )
    const readerSubject = await signIn('reader@douro.example', 'passkey')
    await acceptInvitation(database, { token, subject: readerSubject, email: 'reader@douro.example', name: 'Reader', language: 'en' }, new Date())

    expect(await shopActions.inviteStaff(null, form(invite))).toEqual({ ok: false, failure: 'role' })
  })

  it('rolls back what an action wrote when it refuses', async () => {
    await signIn('owner@douro.example', 'passkey')
    const refused = await shopActions.inviteStaff(null, form({ ...invite, email: 'manager@douro.example', role: 'owner' }))
    expect(refused).toEqual({ ok: false, failure: 'refused', reason: 'role_not_invitable' })
  })
})
