import { createHash, randomUUID } from 'node:crypto'
import { DROP_POINT_VIEW } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { rentalDetail } from './booking-repository.ts'
import { beginComparison } from './comparison-repository.ts'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { confirmDropOff, dropOffNotice, dropOffsWaiting, photoRepeatsEvidence, reportDropOffMissing, saveSelfReturnSettings, selfReturnFor, selfReturnSettings, sendSelfReturn, startSelfReturn } from './self-return-repository.ts'
import { captureSessions, comparisons, holds, outbox, photos, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-04T21:40:00Z')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }
const SETTINGS = { allowed: true, dropPoint: 'The locked rack left of the door.', hours: { opens: '09:00', closes: '19:00' } }
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

// What a renter's link does: the link's shop, and no person named.
const asRenter = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_app', shopId: shop.scope.shopId }, work)

async function photograph(sessionId: string, views: readonly string[], act = asRenter) {
  for (const view of views) {
    const key = `${sessionId}/${view}/${randomUUID()}.jpg`
    const recorded = await act((transaction) => recordPhoto(transaction, sessionId, { view, evidenceKey: key, sha256: createHash('sha256').update(key).digest('hex'), quality: QUALITY }, NOW))
    if (!recorded.ok) throw new Error(recorded.reason)
  }
}

// Handed over with both required views; the optional battery view was not photographed.
async function handedOver(count = 1) {
  const rental = await shop.readyRental(count)
  for (const rentalItemId of rental.rentalItemIds) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId, kind: 'handover', actorUserId: shop.scope.userId ?? null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    await photograph(started.sessionId, ['left-side', 'right-side'], (work) => shop.act(work))
    await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  }
  return rental
}

async function droppedOff(count = 1) {
  const rental = await handedOver(count)
  const started = await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))
  if (!started.ok) throw new Error(started.reason)
  for (const sessionId of started.sessionIds) await photograph(sessionId, ['left-side', 'right-side', DROP_POINT_VIEW])
  const sent = await asRenter((transaction) => sendSelfReturn(transaction, rental.rentalId, NOW))
  if (!sent.ok) throw new Error(sent.reason)
  return { ...rental, sessionIds: started.sessionIds }
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'self-return', NOW)
  other = await readyRentalShop(database, 'other-self-return', NOW)
  await shop.act((transaction) => saveSelfReturnSettings(transaction, shop.scope.shopId, SETTINGS))
})

describe('the shop’s self-return settings', () => {
  it('are off for a new shop, and read back as the owner saved them', async () => {
    expect(await other.act((transaction) => selfReturnSettings(transaction))).toEqual({ allowed: false, dropPoint: null, hours: null })
    expect(await shop.act((transaction) => selfReturnSettings(transaction))).toEqual(SETTINGS)
  })
})

describe('a renter returning the item themselves', () => {
  it('is refused where the shop does not allow it, before the handover, and to another shop', async () => {
    const elsewhere = await other.readyRental()
    expect(await other.act((transaction) => startSelfReturn(transaction, elsewhere.rentalId, NOW))).toEqual({ ok: false, reason: 'not_allowed' })
    const notYet = await shop.readyRental()
    expect(await asRenter((transaction) => startSelfReturn(transaction, notYet.rentalId, NOW))).toEqual({ ok: false, reason: 'not_ready' })
    expect(await asRenter((transaction) => startSelfReturn(transaction, elsewhere.rentalId, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })

  it('photographs every view taken at the handover and where the item was left, and starting again resumes', async () => {
    const rental = await handedOver()
    const started = await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))
    if (!started.ok) throw new Error(started.reason)
    expect(await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))).toEqual(started)
    const session = await asRenter((transaction) => captureSession(transaction, started.sessionIds[0] ?? ''))
    expect(session?.kind).toBe('return')
    expect(session?.plan.map((view) => [view.key, view.required])).toEqual([['left-side', true], ['right-side', true], [DROP_POINT_VIEW, true]])
    expect(session?.missing).toEqual(['left-side', 'right-side', DROP_POINT_VIEW])
  })

  it('is not sent until every view of every item is photographed', async () => {
    const rental = await handedOver()
    const started = await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))
    if (!started.ok) throw new Error(started.reason)
    await photograph(started.sessionIds[0] ?? '', ['left-side', 'right-side'])
    expect(await asRenter((transaction) => sendSelfReturn(transaction, rental.rentalId, NOW))).toEqual({ ok: false, reason: 'views_missing' })
    expect((await asRenter((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe('out')
  })

  it('leaves the rental dropped off from the moment it was sent, compares it, and moves no money', async () => {
    const rental = await droppedOff(2)
    const [row] = await database.select().from(rentals).where(eq(rentals.id, rental.rentalId))
    expect(row).toMatchObject({ state: 'dropped_off', droppedOffAt: NOW })
    const queued = await database.select().from(comparisons).where(eq(comparisons.shopId, shop.scope.shopId))
    const mine = queued.filter((comparison) => rental.sessionIds.includes(comparison.returnSessionId))
    expect(mine).toHaveLength(2)
    expect((await database.select().from(outbox)).filter((message) => message.queue === 'comparisons' && mine.some((comparison) => comparison.id === message.payload['comparisonId']))).toHaveLength(2)
    expect((await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId)))[0]?.state).toBe('placed')
    expect(await asRenter((transaction) => sendSelfReturn(transaction, rental.rentalId, NOW))).toEqual({ ok: true })
  })

  it('is compared overnight while the rental stays dropped off', async () => {
    const rental = await droppedOff()
    const [comparison] = await database.select().from(comparisons).where(eq(comparisons.returnSessionId, rental.sessionIds[0] ?? ''))
    const work = await shop.act((transaction) => beginComparison(transaction, comparison?.id ?? '', NOW))
    expect(work?.after.map((photo) => photo.view).sort()).toEqual([DROP_POINT_VIEW, 'left-side', 'right-side'])
    expect((await shop.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe('dropped_off')
  })

  it('knows a photograph that repeats this item’s earlier evidence, byte for byte, and not another item’s', async () => {
    const rental = await handedOver()
    const started = await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))
    if (!started.ok) throw new Error(started.reason)
    const sessionId = started.sessionIds[0] ?? ''
    const [handover] = await database.select().from(photos).innerJoin(captureSessions, eq(captureSessions.id, photos.sessionId)).where(and(eq(captureSessions.rentalItemId, rental.rentalItemIds[0] ?? ''), eq(captureSessions.kind, 'handover')))
    expect(await asRenter((transaction) => photoRepeatsEvidence(transaction, sessionId, handover?.photos.sha256 ?? ''))).toBe(true)
    expect(await asRenter((transaction) => photoRepeatsEvidence(transaction, sessionId, 'f'.repeat(64)))).toBe(false)
    await photograph(sessionId, ['left-side'])
    const [mine] = await database.select().from(photos).where(eq(photos.sessionId, sessionId))
    expect(await asRenter((transaction) => photoRepeatsEvidence(transaction, sessionId, mine?.sha256 ?? ''))).toBe(true)
    // A rental of both the shop's items: one of them is another item.
    const both = await droppedOff(2)
    const answers = await Promise.all(both.sessionIds.map((each) => asRenter((transaction) => photoRepeatsEvidence(transaction, each, mine?.sha256 ?? ''))))
    expect(answers).toContain(false)
  })

  it('cannot be started while staff are photographing the return at the counter', async () => {
    const rental = await handedOver()
    await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return', actorUserId: shop.scope.userId ?? null }, NOW))
    expect(await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))).toEqual({ ok: false, reason: 'staff_returning' })
  })

  it('is taken over by staff who start the return at the counter before it was sent, with no drop point to photograph', async () => {
    const rental = await handedOver()
    const started = await asRenter((transaction) => startSelfReturn(transaction, rental.rentalId, NOW))
    if (!started.ok) throw new Error(started.reason)
    const staff = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return', actorUserId: shop.scope.userId ?? null }, NOW))
    expect(staff).toEqual({ ok: true, sessionId: started.sessionIds[0] })
    expect((await shop.act((transaction) => captureSession(transaction, started.sessionIds[0] ?? '')))?.plan.map((view) => view.key)).toEqual(['left-side', 'right-side', 'battery'])
  })

  it('shows the renter what they sent and where the shop wants the item', async () => {
    const rental = await droppedOff()
    expect(await asRenter((transaction) => selfReturnFor(transaction, rental.rentalId))).toMatchObject({
      settings: SETTINGS,
      timeZone: 'UTC',
      state: 'dropped_off',
      droppedOffAt: NOW,
      missingAt: null,
      items: [{ sessionId: rental.sessionIds[0], sealed: true, missing: [] }],
    })
  })
})

describe('a person checking an item a renter dropped off', () => {
  it('lists it for the morning with when it came back, its views and what the comparison found', async () => {
    const rental = await droppedOff()
    const waiting = await shop.act((transaction) => dropOffsWaiting(transaction))
    expect(waiting.find((each) => each.rentalId === rental.rentalId)).toMatchObject({ droppedOffAt: NOW, onTime: true, renterName: 'Priya Natarajan', missingAt: null, holdCents: 300_00, currency: 'EUR', items: [{ views: 2, findings: 0, comparison: 'pending', viewLabel: 'Left side', before: { view: 'left-side', displayKey: null }, after: { view: 'left-side', displayKey: null }, dropPoint: { view: DROP_POINT_VIEW, displayKey: null }, region: null }] })
    expect(await other.act((transaction) => dropOffsWaiting(transaction))).toEqual([])
  })

  it('makes it returned once they saw it, and only then', async () => {
    const rental = await droppedOff()
    expect(await other.act((transaction) => confirmDropOff(transaction, rental.rentalId))).toEqual({ ok: false, reason: 'not_found' })
    expect(await shop.act((transaction) => confirmDropOff(transaction, rental.rentalId))).toEqual({ ok: true })
    expect((await shop.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe('returned')
    expect(await shop.act((transaction) => confirmDropOff(transaction, rental.rentalId))).toEqual({ ok: false, reason: 'not_dropped_off' })
    expect((await shop.act((transaction) => dropOffsWaiting(transaction))).some((each) => each.rentalId === rental.rentalId)).toBe(false)
  })

  it('knows whom to tell it was not found: the payer PayPal named, in the rental’s language, and when it was sent', async () => {
    const rental = await droppedOff()
    expect(await shop.act((transaction) => dropOffNotice(transaction, rental.rentalId))).toMatchObject({ email: 'priya@example.com', language: 'en', timeZone: 'UTC', droppedOffAt: NOW, simulated: false })
    expect(await other.act((transaction) => dropOffNotice(transaction, rental.rentalId))).toBeUndefined()
  })

  it('records once that it was not at the drop point, keeps the hold, and can still confirm it when it turns up', async () => {
    const rental = await droppedOff()
    const later = new Date(NOW.getTime() + 12 * 3_600_000)
    expect(await shop.act((transaction) => reportDropOffMissing(transaction, rental.rentalId, shop.scope.userId ?? '', later))).toEqual({ ok: true })
    expect(await shop.act((transaction) => reportDropOffMissing(transaction, rental.rentalId, shop.scope.userId ?? '', NOW))).toEqual({ ok: false, reason: 'already_reported' })
    expect((await shop.act((transaction) => dropOffsWaiting(transaction))).find((each) => each.rentalId === rental.rentalId)).toMatchObject({ missingAt: later, missingBy: 'Ana' })
    expect((await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId)))[0]?.state).toBe('placed')
    expect(await shop.act((transaction) => confirmDropOff(transaction, rental.rentalId))).toEqual({ ok: true })
  })
})
