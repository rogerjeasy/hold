// @vitest-environment node
import { acceptInvitation, auditLog, createInvitation, rentals } from '@hold/db'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { ERASED } from '@hold/domain'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 9).toString('base64')

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => jar.set(name, value),
      delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === 'string' ? cookie : cookie.name),
    }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))

const { eraseRenter } = await import('./actions')
const { getServices } = await import('@/server/services')
const { form, signIn } = await import('@/test/shop-session')

vi.setConfig({ testTimeout: 30_000 })

const NOW = new Date('2026-11-04T10:00:00Z')
const OWNER = 'owner@erasure.example'
const OTHER_OWNER = 'owner@elsewhere.example'
let shop: ReadyRentalShop
let other: ReadyRentalShop
let payers = 0

// A rental of this shop, by a renter of its own, that has ended or is still open.
async function rentalOf(at: ReadyRentalShop, state: 'closed' | 'booked' = 'closed'): Promise<string> {
  payers += 1
  const payer = `PAYER-WEB-ERASE-${String(payers)}`
  return state === 'closed' ? at.endedRental(payer) : at.paidRental(payer)
}

async function contactOf(rentalId: string) {
  const { database } = await getServices()
  const row = (await database.select({ id: rentals.id, name: rentals.contactName, email: rentals.contactEmail }).from(rentals)).find((each) => each.id === rentalId)
  return { name: row?.name, email: row?.email }
}

const erase = (rentalId: string) => eraseRenter(null, form({ rentalId, locale: 'en' }))

beforeAll(async () => {
  const { database } = await getServices()
  shop = await readyRentalShop(database, await signIn(jar, OWNER, 'passkey'), NOW)
  other = await readyRentalShop(database, await signIn(jar, OTHER_OWNER, 'passkey'), NOW)
  for (const role of ['manager', 'counter_staff', 'read_only'] as const) {
    const email = `${role}@erasure.example`
    const { token } = await shop.act((transaction) =>
      createInvitation(transaction, { shopId: shop.scope.shopId, invitedByUserId: shop.scope.userId ?? '', email, role, approvalLimitCents: 0, language: 'en' }, NOW),
    )
    const subject = await signIn(jar, email, 'passkey')
    await acceptInvitation(database, { token, subject, email, name: role, language: 'en' }, NOW)
  }
})

beforeEach(() => {
  jar.clear()
})

describe('erasing a renter’s personal details', () => {
  it('is done by the owner, proven by a passkey, and leaves an audit line that names no one', async () => {
    const rentalId = await rentalOf(shop)
    await signIn(jar, OWNER, 'passkey')
    expect(await erase(rentalId)).toEqual({ ok: true, value: { rentalId, rentals: 1 } })
    expect(await contactOf(rentalId)).toEqual({ name: ERASED, email: ERASED })
    const { database } = await getServices()
    const lines = (await database.select().from(auditLog)).filter((line) => line.shopId === shop.scope.shopId && line.action === 'renter.erased')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.detail).toMatchObject({ rentalId, rentals: 1 })
    expect(JSON.stringify(lines[0])).not.toMatch(/Priya|example\.com/)
  })

  it('asks the owner to confirm with a passkey first', async () => {
    const rentalId = await rentalOf(shop)
    await signIn(jar, OWNER, 'email_code')
    expect(await erase(rentalId)).toEqual({ ok: false, failure: 'passkey_needed' })
    expect(await contactOf(rentalId)).toEqual({ name: 'Priya', email: 'priya@example.com' })
  })

  it('is refused to managers, counter staff and read-only members', async () => {
    const rentalId = await rentalOf(shop)
    for (const role of ['manager', 'counter_staff', 'read_only']) {
      await signIn(jar, `${role}@erasure.example`, 'passkey')
      expect(await erase(rentalId)).toEqual({ ok: false, failure: 'role' })
    }
    expect(await contactOf(rentalId)).toEqual({ name: 'Priya', email: 'priya@example.com' })
  })

  it('is refused to someone signed out', async () => {
    expect(await erase(await rentalOf(shop))).toEqual({ ok: false, failure: 'signed_out' })
  })

  it('is refused for another shop’s rental, which keeps its details', async () => {
    const rentalId = await rentalOf(other)
    await signIn(jar, OWNER, 'passkey')
    expect(await erase(rentalId)).toEqual({ ok: false, failure: 'refused', reason: 'not_found' })
    expect(await contactOf(rentalId)).toEqual({ name: 'Priya', email: 'priya@example.com' })
  })

  it('waits while the renter’s rental is still open', async () => {
    const rentalId = await rentalOf(shop, 'booked')
    await signIn(jar, OWNER, 'passkey')
    expect(await erase(rentalId)).toEqual({ ok: false, failure: 'refused', reason: 'rental_open' })
    expect(await contactOf(rentalId)).toEqual({ name: 'Priya', email: 'priya@example.com' })
  })

  it('cannot be done twice', async () => {
    const rentalId = await rentalOf(shop)
    await signIn(jar, OWNER, 'passkey')
    expect(await erase(rentalId)).toMatchObject({ ok: true })
    expect(await erase(rentalId)).toEqual({ ok: false, failure: 'refused', reason: 'already_erased' })
  })

  it('takes nothing but the rental from the form', async () => {
    await signIn(jar, OWNER, 'passkey')
    expect(await eraseRenter(null, form({ rentalId: await rentalOf(shop), renterId: 'someone', locale: 'en' }))).toMatchObject({ ok: false, failure: 'invalid' })
  })

  it('is the only server function of its feature, built by the wrapper with the owner alone', async () => {
    const { shopActionSpec } = await import('@/server/shop-access')
    expect(Object.keys(await import('./actions'))).toEqual(['eraseRenter'])
    expect(shopActionSpec(eraseRenter)).toEqual({ name: 'renter.erased', roles: ['owner'], needsPasskey: true })
  })
})
