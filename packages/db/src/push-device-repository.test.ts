import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { issueRenterLink } from './booking-repository.ts'
import { recordPushDelivery, registerRenterPush, registerStaffPush, renterPushTargets, staffPushTargets, unregisterRenterPush, unregisterStaffPush } from './push-device-repository.ts'
import { pushDevices, renterLinks, staffRoles, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-02T10:00:00Z')
const later = (days: number) => new Date(NOW.getTime() + days * 86_400_000)
const PHONE = { token: 'ExponentPushToken[phone-one]', platform: 'ios', locale: 'fr' } as const
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
let slot = 0

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'push', NOW)
  other = await readyRentalShop(database, 'push-other', NOW)
})
afterAll(async () => { await database.$client.close() })

const asWorker = <Result>(target: ReadyRentalShop, work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: target.scope.shopId }, work)

// A rental and a link to it, as a renter's phone would register with.
async function linkedRental(target: ReadyRentalShop = shop, expiresAt = later(30)) {
  slot += 1
  const rentalId = await target.paidRental(`PAYER-PUSH-${String(slot)}`)
  await target.act((transaction) => issueRenterLink(transaction, target.scope.shopId, rentalId, { fingerprint: `phone-link-${String(slot)}`, expiresAt }, ['view']))
  const [link] = await database.select().from(renterLinks).where(eq(renterLinks.tokenFingerprint, `phone-link-${String(slot)}`))
  if (link === undefined) throw new Error('No link.')
  return { id: link.id, shopId: link.shopId, rentalId }
}

async function person(subject: string, role: 'owner' | 'manager' | 'counter_staff' | 'read_only', target: ReadyRentalShop = shop) {
  const [row] = await database.insert(users).values({ cognitoSubject: subject, email: `${subject}@shop.example`, name: subject }).returning()
  const userId = row?.id ?? ''
  await database.insert(staffRoles).values({ shopId: target.scope.shopId, userId, role })
  return userId
}

describe('a renter’s phone registered for a rental', () => {
  it('is reached through the link it registered with, by the reference only it knows, in its own language', async () => {
    const link = await linkedRental()
    expect(await shop.act((transaction) => registerRenterPush(transaction, link, PHONE, 'reference-1', NOW))).toEqual({ reference: 'reference-1' })
    expect(await asWorker(shop, (transaction) => renterPushTargets(transaction, link.rentalId, NOW))).toEqual({
      shopName: 'Shop push',
      devices: [{ id: expect.any(String) as unknown, token: PHONE.token, locale: 'fr', reference: 'reference-1', pendingTicket: null }],
    })
  })

  it('registers once per phone and rental: again, it keeps its reference and moves to the newer link', async () => {
    const link = await linkedRental()
    await shop.act((transaction) => registerRenterPush(transaction, link, PHONE, 'reference-2', NOW))
    const newer = await linkedRental()
    await shop.act((transaction) => issueRenterLink(transaction, shop.scope.shopId, link.rentalId, { fingerprint: 'phone-newer-link', expiresAt: later(60) }, ['view']))
    const [second] = await database.select().from(renterLinks).where(eq(renterLinks.tokenFingerprint, 'phone-newer-link'))
    expect(await shop.act((transaction) => registerRenterPush(transaction, { ...link, id: second?.id ?? '' }, { ...PHONE, locale: 'de' }, 'reference-other', later(1)))).toEqual({ reference: 'reference-2' })
    const rows = await database.select().from(pushDevices).where(eq(pushDevices.rentalId, link.rentalId))
    expect(rows).toEqual([expect.objectContaining({ renterLinkId: second?.id, locale: 'de', reference: 'reference-2', lastUsedAt: later(1), revokedAt: null })])
    expect(newer.rentalId).not.toBe(link.rentalId)
  })

  it('is reached no more once the renter turns pushes off, or the link it registered with is revoked or expires', async () => {
    const off = await linkedRental()
    await shop.act((transaction) => registerRenterPush(transaction, off, PHONE, 'reference-off', NOW))
    await shop.act((transaction) => unregisterRenterPush(transaction, off.rentalId, PHONE.token, NOW))
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, off.rentalId, NOW)))?.devices).toEqual([])

    const revoked = await linkedRental()
    await shop.act((transaction) => registerRenterPush(transaction, revoked, PHONE, 'reference-revoked', NOW))
    await database.update(renterLinks).set({ revokedAt: NOW }).where(eq(renterLinks.id, revoked.id))
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, revoked.rentalId, NOW)))?.devices).toEqual([])

    const expiring = await linkedRental(shop, later(2))
    await shop.act((transaction) => registerRenterPush(transaction, expiring, PHONE, 'reference-expiring', NOW))
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, expiring.rentalId, later(1))))?.devices).toHaveLength(1)
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, expiring.rentalId, later(3))))?.devices).toEqual([])
  })

  it('keeps each push’s ticket, and stops at a phone Expo says is gone', async () => {
    const link = await linkedRental()
    await shop.act((transaction) => registerRenterPush(transaction, link, PHONE, 'reference-gone', NOW))
    const [device] = (await asWorker(shop, (transaction) => renterPushTargets(transaction, link.rentalId, NOW)))?.devices ?? []
    await asWorker(shop, (transaction) => recordPushDelivery(transaction, { sent: [{ id: device?.id ?? '', ticket: 'ticket-1' }], gone: [] }, later(1)))
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, link.rentalId, later(1))))?.devices).toEqual([expect.objectContaining({ pendingTicket: 'ticket-1' })])
    await asWorker(shop, (transaction) => recordPushDelivery(transaction, { sent: [], gone: [device?.id ?? ''] }, later(2)))
    expect((await asWorker(shop, (transaction) => renterPushTargets(transaction, link.rentalId, later(2))))?.devices).toEqual([])
  })
})

describe('a member of staff’s phone', () => {
  it('is reached for the events their role hears, in this shop, until they sign out of it', async () => {
    const manager = await person('push-manager', 'manager')
    const counter = await person('push-counter', 'counter_staff')
    const readOnly = await person('push-read-only', 'read_only')
    for (const [userId, token] of [[manager, 'ExponentPushToken[manager]'], [counter, 'ExponentPushToken[counter]'], [readOnly, 'ExponentPushToken[read-only]']] as const) {
      await inShop(database, { role: 'hold_app', shopId: shop.scope.shopId, userId }, (transaction) => registerStaffPush(transaction, { shopId: shop.scope.shopId, userId }, { ...PHONE, token }, NOW))
    }
    const tokens = async (roles: readonly ('owner' | 'manager' | 'counter_staff')[]) => ((await asWorker(shop, (transaction) => staffPushTargets(transaction, shop.scope.shopId, roles)))?.devices ?? []).map((device) => device.token).sort()
    expect(await tokens(['owner', 'manager'])).toEqual(['ExponentPushToken[manager]'])
    expect(await tokens(['owner', 'manager', 'counter_staff'])).toEqual(['ExponentPushToken[counter]', 'ExponentPushToken[manager]'])
    await inShop(database, { role: 'hold_app', shopId: shop.scope.shopId, userId: counter }, (transaction) => unregisterStaffPush(transaction, counter, 'ExponentPushToken[counter]', NOW))
    expect(await tokens(['owner', 'manager', 'counter_staff'])).toEqual(['ExponentPushToken[manager]'])
  })

  it('stops hearing a shop they no longer work in', async () => {
    const leaving = await person('push-leaving', 'counter_staff')
    await inShop(database, { role: 'hold_app', shopId: shop.scope.shopId, userId: leaving }, (transaction) => registerStaffPush(transaction, { shopId: shop.scope.shopId, userId: leaving }, { ...PHONE, token: 'ExponentPushToken[leaving]' }, NOW))
    await database.delete(staffRoles).where(eq(staffRoles.userId, leaving))
    expect(((await asWorker(shop, (transaction) => staffPushTargets(transaction, shop.scope.shopId, ['counter_staff'])))?.devices ?? []).map((device) => device.token)).not.toContain('ExponentPushToken[leaving]')
  })
})

describe('the phones of a second shop', () => {
  it('are neither read nor changed from the first', async () => {
    const theirs = await linkedRental(other)
    await other.act((transaction) => registerRenterPush(transaction, theirs, PHONE, 'reference-theirs', NOW))
    const otherOwner = other.scope.userId ?? ''
    await other.act((transaction) => registerStaffPush(transaction, { shopId: other.scope.shopId, userId: otherOwner }, { ...PHONE, token: 'ExponentPushToken[their-owner]' }, NOW))
    expect(await shop.act((transaction) => transaction.select().from(pushDevices).where(eq(pushDevices.shopId, other.scope.shopId)))).toEqual([])
    expect(await asWorker(shop, (transaction) => renterPushTargets(transaction, theirs.rentalId, NOW))).toBeUndefined()
    await shop.act((transaction) => unregisterRenterPush(transaction, theirs.rentalId, PHONE.token, NOW))
    expect((await asWorker(other, (transaction) => renterPushTargets(transaction, theirs.rentalId, NOW)))?.devices).toHaveLength(1)
    // A registration that names the other shop is refused by row-level security.
    await expect(shop.act((transaction) => registerStaffPush(transaction, { shopId: other.scope.shopId, userId: otherOwner }, { ...PHONE, token: 'ExponentPushToken[forged]' }, NOW))).rejects.toThrow()
  })
})
