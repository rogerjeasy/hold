import { createHash } from 'node:crypto'
import { holdStanding, money, shopDay } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { shopToday } from './shop-today.ts'
import { readyRentalShop, VIEWS } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// 10:12 in Lisbon on Wednesday 14 October.
const NOW = new Date('2026-10-14T09:12:00Z')
const TIME_ZONE = 'Europe/Lisbon'
const window = { now: NOW, day: shopDay(TIME_ZONE, NOW) }

let database: TestDatabase
let shopA: Scope & { readonly userId: string }
let shopB: Scope & { readonly userId: string }

async function owner(subject: string, name: string): Promise<Scope & { readonly userId: string }> {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: TIME_ZONE } })
  return { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
}

const priceList = {
  currency: 'EUR',
  ownerApprovalThreshold: undefined,
  entries: [
    { description: 'Deep scratch on the frame', category: 'damage' as const, amount: money(35_00, 'EUR') },
    { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') },
  ],
  wearPolicy: 'Light scuffs are ordinary wear.',
}

const addSamples = (scope: Scope & { readonly userId: string }) =>
  inShop(database, scope, (transaction) => addSampleRentals(transaction, { shopId: scope.shopId, userId: scope.userId, timeZone: TIME_ZONE, now: NOW }))

beforeAll(async () => {
  database = await createTestDatabase()
  shopA = await owner('owner-a', 'Ribeira Bikes')
  shopB = await owner('owner-b', 'Douro Kayaks')
})

describe('a shop with no rentals', () => {
  it('reads as an empty day', async () => {
    const today = await inShop(database, shopB, (transaction) => shopToday(transaction, window))
    expect(today).toEqual({
      rentalsOut: 0,
      itemsOut: 0,
      dueBackToday: 0,
      activeHolds: [],
      claimsWaiting: [],
      droppedOff: [],
      late: [],
      counter: [],
      month: { feesCents: 0, releasedCents: 0, claimedCents: 0, recoveredCents: 0 },
      routine: { handover: { medianSeconds: null, count: 0 }, return: { medianSeconds: null, count: 0 } },
      // Signing up is the shop's first line.
      activity: [expect.objectContaining({ action: 'shop.created', actorName: 'Douro Kayaks', simulated: false })],
      rentals: { total: 0, simulated: 0 },
    })
  })

  it('cannot take sample rentals before it has a price list', async () => {
    expect(await addSamples(shopB)).toEqual({ ok: false, reason: 'no_price_list' })
  })
})

describe('sample rentals', () => {
  beforeAll(async () => {
    await inShop(database, shopA, (transaction) => publishPriceList(transaction, shopA.shopId, priceList, NOW))
    expect(await addSamples(shopA)).toEqual({ ok: true, rentals: 12 })
  })

  it('are all marked as simulated', async () => {
    const today = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(today.rentals).toEqual({ total: 12, simulated: 12 })
  })

  it('are added once', async () => {
    expect(await addSamples(shopA)).toEqual({ ok: false, reason: 'has_rentals' })
  })

  it('give the day’s figures', async () => {
    const today = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(today).toMatchObject({ rentalsOut: 5, itemsOut: 7, dueBackToday: 3 })
    expect(today.activeHolds.reduce((sum, hold) => sum + hold.reservedCents, 0)).toBe(3250_00)
    expect(today.activeHolds.map((hold) => holdStanding(hold, NOW)).sort()).toEqual(['assured', 'assured', 'assured', 'assured', 'ending', 'valid', 'valid', 'valid', 'valid'])
  })

  it('list the claims waiting, with the renter’s words for a contested one', async () => {
    const { claimsWaiting } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(claimsWaiting).toEqual([
      expect.objectContaining({ renterName: 'Priya Natarajan', state: 'awaiting_approval', totalCents: 35_00, firstLine: 'Deep scratch on the frame', renterComment: null }),
      expect.objectContaining({ renterName: 'Tom Becker', state: 'contested', totalCents: 45_00, renterComment: 'The lock was in the bag when I handed it back.' }),
    ])
  })

  it('find the late rental', async () => {
    const { late } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(late.map((rental) => rental.renterName)).toEqual(['Lea Fischer'])
  })

  it('fill the counter for today, in order', async () => {
    const { counter } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(counter.map((visit) => [visit.kind, visit.renterName, visit.done])).toEqual([
      ['handover', 'Lukas Weber', true],
      ['return', 'Sofia Marques', false],
      ['return', 'Inês Costa', false],
      ['handover', 'Hannah Svensson', false],
      ['return', 'Ahmed Khan', false],
    ])
    expect(counter[1]?.items).toEqual(['E-bike 1', 'E-bike 2'])
    expect(counter[3]?.hold).toMatchObject({ state: 'requested', assuredUntil: null })
  })

  it('add up the month from the money log and the claims', async () => {
    const { month } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(month).toEqual({ feesCents: 533_00, releasedCents: 515_00, claimedCents: 115_00, recoveredCents: 35_00 })
  })

  it('show the latest activity first, with each sample line marked as simulated', async () => {
    const { activity } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(activity).toHaveLength(6)
    expect(activity.filter((line) => line.action !== 'shop.created').every((line) => line.simulated && line.renterName !== null)).toBe(true)
    expect(activity.find((line) => line.action === 'shop.created')?.simulated ?? false).toBe(false)
    expect(activity.map((line) => line.at.getTime())).toEqual(activity.map((line) => line.at.getTime()).sort((a, b) => b - a))
  })

  it('stay in their own shop', async () => {
    const today = await inShop(database, shopB, (transaction) => shopToday(transaction, window))
    expect(today.rentals).toEqual({ total: 0, simulated: 0 })
    expect(today.activeHolds).toEqual([])
    expect(today.activity.map((line) => line.action)).toEqual(['shop.created'])
  })
})

describe('sample rentals added late in the day', () => {
  // 22:30 in Lisbon: today's returns must still be ahead, not late.
  const LATE = new Date('2026-10-14T21:30:00Z')

  it('keep today’s visits on today, with only the one late return', async () => {
    const shop = await owner('owner-c', 'Lisboa Bikes')
    await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, priceList, LATE))
    await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: TIME_ZONE, now: LATE }))
    const day = shopDay(TIME_ZONE, LATE)
    const today = await inShop(database, shop, (transaction) => shopToday(transaction, { now: LATE, day }))
    expect(today.counter).toHaveLength(5)
    expect(today.counter.every((visit) => visit.at >= day.start && visit.at < day.end)).toBe(true)
    expect(today.late.map((rental) => rental.renterName)).toEqual(['Lea Fischer'])
    expect(today.dueBackToday).toBe(3)
  })
})

// project-description.md section 13: the handover and the return are timed from the shop's own sessions, never from
// the demonstration's sample photographs, and every time comes with its count.
describe('the counter routine', () => {
  it('is not measured from sample rentals, whose photographs are the demonstration’s', async () => {
    const { routine } = await inShop(database, shopA, (transaction) => shopToday(transaction, window))
    expect(routine).toEqual({ handover: { medianSeconds: null, count: 0 }, return: { medianSeconds: null, count: 0 } })
  })

  it('times a sealed handover from its opening to its seal', async () => {
    const shop = await readyRentalShop(database, 'routine', new Date(NOW.getTime() - 86_400_000))
    const rental = await shop.readyRental()
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'handover', actorUserId: shop.scope.userId ?? null }, new Date(NOW.getTime() - 48_000)))
    if (!started.ok) throw new Error(started.reason)
    for (const view of VIEWS) {
      const recorded = await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: `evidence/routine-${view}.jpg`, sha256: createHash('sha256').update(view).digest('hex'), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 } }, new Date(NOW.getTime() - 30_000)))
      if (!recorded.ok) throw new Error(recorded.reason)
    }
    const sealed = await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
    if (!sealed.ok) throw new Error(sealed.reason)
    const { routine } = await shop.act((transaction) => shopToday(transaction, window))
    expect(routine.handover).toEqual({ medianSeconds: 48, count: 1 })
  })
})
