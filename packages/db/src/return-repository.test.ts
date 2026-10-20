import { createHash, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { rentalDetail } from './booking-repository.ts'
import { captureSession, recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { returnBaseline } from './return-repository.ts'
import { captureSessions, comparisons, holds, itemTypes, outbox, photoPlans, photos, rentals } from './schema/index.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-20T09:00:00Z')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

async function photographed(sessionId: string) {
  for (const view of ['left-side', 'right-side']) {
    const key = `${sessionId}/${view}/${randomUUID()}.jpg`
    await shop.act((transaction) => recordPhoto(transaction, sessionId, { view, evidenceKey: key, sha256: createHash('sha256').update(key).digest('hex'), quality: QUALITY }, NOW))
  }
}

async function handedOver(count = 1) {
  const rental = await shop.readyRental(count)
  for (const rentalItemId of rental.rentalItemIds) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId, kind: 'handover', actorUserId: shop.scope.userId ?? null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    await photographed(started.sessionId)
    await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  }
  return rental
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'return', NOW)
  other = await readyRentalShop(database, 'other-return', NOW)
})

describe('return inspection evidence', () => {
  it('starts one return after handover, preserving its baseline and leaving the hold untouched', async () => {
    const rental = await handedOver()
    const request = { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return' as const, actorUserId: shop.scope.userId ?? null }
    const started = await shop.act((transaction) => startCaptureSession(transaction, request, NOW))
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.reason)
    expect(await shop.act((transaction) => startCaptureSession(transaction, request, NOW))).toEqual(started)
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    expect(session).toMatchObject({ kind: 'return', rentalId: rental.rentalId, missing: ['left-side', 'right-side'] })
    expect(session?.plan.map((view) => view.key)).toEqual(['left-side', 'right-side', 'battery'])
    expect((await shop.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe('out')
  })

  it('refuses a return before handover and reveals nothing to another shop', async () => {
    const rental = await shop.readyRental()
    const request = { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return' as const, actorUserId: null }
    expect(await shop.act((transaction) => startCaptureSession(transaction, request, NOW))).toEqual({ ok: false, reason: 'not_ready' })
    expect(await other.act((transaction) => startCaptureSession(transaction, request, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })

  it('seals the return once and queues exactly one comparison without moving money', async () => {
    const rental = await handedOver()
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return', actorUserId: null }, NOW))
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.reason)
    expect(await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))).toMatchObject({ ok: false, reason: 'views_missing' })
    await photographed(started.sessionId)
    const sealed = await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
    expect(sealed.ok).toBe(true)
    expect(await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))).toEqual(sealed)
    expect((await shop.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe('returned')
    const rows = await database.select().from(comparisons).where(eq(comparisons.returnSessionId, started.sessionId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.state).toBe('pending')
    const messages = (await database.select().from(outbox)).filter((row) => row.queue === 'comparisons' && row.payload['comparisonId'] === rows[0]?.id)
    expect(messages).toHaveLength(1)
    expect((await database.select().from(holds).where(eq(holds.rentalId, rental.rentalId)))[0]?.state).toBe('placed')
    expect(await other.act((transaction) => returnBaseline(transaction, started.sessionId))).toEqual([])
  })

  it('uses the handover plan and only its current photographs after the item type changes', async () => {
    const rental = await handedOver()
    const [handover] = await database.select().from(captureSessions).where(eq(captureSessions.rentalItemId, rental.rentalItemIds[0] ?? ''))
    if (handover === undefined) throw new Error('No handover')
    const baseline = await database.select().from(photos).where(eq(photos.sessionId, handover.id))
    await shop.act(async (transaction) => {
      const [changed] = await transaction.insert(photoPlans).values({ shopId: shop.scope.shopId, name: 'New plan', views: [{ key: 'front', label: 'Front', outline: 'detail', required: true }] }).returning()
      if (changed === undefined) throw new Error('No plan')
      await transaction.update(itemTypes).set({ photoPlanId: changed.id }).where(eq(itemTypes.id, shop.typeId))
    })
    const request = { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind: 'return' as const, actorUserId: null }
    const started = await shop.act((transaction) => startCaptureSession(transaction, request, NOW))
    if (!started.ok) throw new Error(started.reason)
    expect(await shop.act((transaction) => returnBaseline(transaction, started.sessionId))).toEqual(baseline.sort((a, b) => a.view.localeCompare(b.view)).map((row) => ({ view: row.view, displayKey: null, simulated: false })))
    expect((await database.select().from(captureSessions).where(eq(captureSessions.id, started.sessionId)))[0]?.photoPlanId).toBe(handover.photoPlanId)
    await shop.act((transaction) => transaction.update(itemTypes).set({ photoPlanId: handover.photoPlanId }).where(eq(itemTypes.id, shop.typeId)))
  })

  it('waits for every item and accepts a late return', async () => {
    const rental = await handedOver(2)
    await shop.act((transaction) => transaction.update(rentals).set({ state: 'overdue' }).where(eq(rentals.id, rental.rentalId)))
    for (const [index, rentalItemId] of rental.rentalItemIds.entries()) {
      const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId, kind: 'return', actorUserId: null }, NOW))
      expect(started.ok).toBe(true)
      if (!started.ok) throw new Error(started.reason)
      await photographed(started.sessionId)
      await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
      expect((await shop.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW)))?.state).toBe(index === 0 ? 'overdue' : 'returned')
      expect(await database.select().from(comparisons).where(eq(comparisons.returnSessionId, started.sessionId))).toHaveLength(index === 0 ? 0 : 1)
    }
  })
})
