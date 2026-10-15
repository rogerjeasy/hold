// @vitest-environment node
import { acceptInvitation, auditLog, createInvitation, inShop, registerOwner } from '@hold/db'
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
const { getServices } = await import('./services')
const { form, signIn: signInTo } = await import('@/test/shop-session')
const signIn = (email: string, factor: 'email_code' | 'passkey') => signInTo(jar, email, factor)

vi.setConfig({ testTimeout: 30_000 })

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

describe('every server function', () => {
  it('is built by the wrapper for its caller, in every feature, so none skips the checks', async () => {
    const { isRenterAction } = await import('./renter-access')
    const { isShopPageAction } = await import('./shop-page-access')
    // A renter acts through a link, someone on a shop's page through its address, everyone else as staff of a shop.
    // Signing in and signing up come before any shop, so the auth feature's actions are the one exception.
    const wrapperFor = (file: string) => (file.includes('/renter/') ? isRenterAction : file.includes('/shop-page/') ? isShopPageAction : isShopAction)
    const files = import.meta.glob<Record<string, unknown>>(['/src/features/*/actions.ts', '!/src/features/auth/actions.ts'])
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['/src/features/shop/actions.ts', '/src/features/items/actions.ts', '/src/features/rentals/actions.ts', '/src/features/renter/actions.ts', '/src/features/shop-page/actions.ts']))
    for (const [file, load] of Object.entries(files)) {
      const exported = Object.entries(await load())
      expect(exported.length, file).toBeGreaterThan(0)
      expect(exported.filter(([, value]) => !wrapperFor(file)(value)).map(([name]) => `${file} ${name}`)).toEqual([])
    }
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

describe('adding sample rentals', () => {
  const sample = { locale: 'en' }
  const prices = {
    currency: 'EUR',
    threshold: '',
    wearPolicy: 'Light scuffs are ordinary wear.',
    description: 'Deep scratch on the frame',
    category: 'damage',
    amount: '35',
    locale: 'en',
  }

  it('refuses a caller who is not signed in', async () => {
    expect(await shopActions.addSampleRentals(null, form(sample))).toEqual({ ok: false, failure: 'signed_out' })
  })

  it('refuses anyone but the owner', async () => {
    await signIn('reader@douro.example', 'passkey')
    expect(await shopActions.addSampleRentals(null, form(sample))).toEqual({ ok: false, failure: 'role' })
  })

  it('needs a published price list, whose prices the sample claims use', async () => {
    const { database } = await getServices()
    const subject = await signIn('sampler@douro.example', 'email_code')
    await registerOwner(database, { subject, email: 'sampler@douro.example', name: 'Sampler', language: 'en', shop: { name: 'Douro Sails', timeZone: 'UTC' } })
    expect(await shopActions.addSampleRentals(null, form(sample))).toEqual({ ok: false, failure: 'refused', reason: 'no_price_list' })
  })

  it('adds them once for an owner, with no passkey needed, and writes the audit line', async () => {
    await signIn('sampler@douro.example', 'passkey')
    expect(await shopActions.publishPrices(null, form(prices))).toMatchObject({ ok: true })
    await signIn('sampler@douro.example', 'email_code')
    expect(await shopActions.addSampleRentals(null, form(sample))).toEqual({ ok: true, value: { rentals: 11 } })
    expect(await shopActions.addSampleRentals(null, form(sample))).toEqual({ ok: false, failure: 'refused', reason: 'has_rentals' })

    const { database } = await getServices()
    const lines = await database.select().from(auditLog)
    expect(lines.filter((line) => line.action === 'sample_rentals.added')).toHaveLength(1)
  })
})
