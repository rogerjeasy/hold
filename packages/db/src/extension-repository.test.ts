import { createHash, randomUUID } from 'node:crypto'
import { addDays, shopDay } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createBooking, rentalDetail } from './booking-repository.ts'
import { shopToday } from './shop-today.ts'
import { recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { beginExtensionCapture, checkExtensionPayment, confirmExtensionCapture, extensionMaxDays, extensionPaymentsToCheck, failExtensionCapture, flagExtensionCapture, quoteExtension, rentalExtensionsOf, saveExtensionMaxDays, saveExtensionOrder } from './extension-repository.ts'
import { authorizations, executions, holds, moneyEvents, outbox, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-01T09:00:00Z')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }
const hours = (from: Date, count: number) => new Date(from.getTime() + count * 3_600_000)
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

// A rental of one e-bike, handed over and out: 40.00 a day, a 300.00 hold placed now for 29 days.
async function out(on = shop) {
  const rental = await on.readyRental()
  const rentalItemId = rental.rentalItemIds[0] ?? ''
  const started = await on.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId, kind: 'handover', actorUserId: on.scope.userId ?? null }, NOW))
  if (!started.ok) throw new Error(started.reason)
  for (const view of ['left-side', 'right-side']) {
    const key = `${started.sessionId}/${view}/${randomUUID()}.jpg`
    await on.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: key, sha256: createHash('sha256').update(key).digest('hex'), quality: QUALITY }, NOW))
  }
  await on.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  const detail = await on.act((transaction) => rentalDetail(transaction, rental.rentalId, NOW))
  if (detail?.state !== 'out') throw new Error('Not out.')
  // As at a real handover, the hold was placed as the rental began, so it has most of its 29 days left.
  await validUntil(rental.rentalId, addDays(detail.endsAt, 20))
  return { ...rental, endsAt: detail.endsAt }
}

async function validUntil(rentalId: string, until: Date) {
  const [hold] = await database.select({ authorizationId: holds.currentAuthorizationId }).from(holds).where(eq(holds.rentalId, rentalId))
  await database.update(authorizations).set({ validUntil: until }).where(eq(authorizations.id, hold?.authorizationId ?? ''))
}

// The worker's own role, which alone may mark an extension paid or failed.
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

async function ordered(rentalId: string, newEndsAt: Date) {
  const quoted = await shop.act((transaction) => quoteExtension(transaction, rentalId, newEndsAt, 'link', NOW))
  if (!quoted.ok) throw new Error(JSON.stringify(quoted))
  const orderId = `EXTENSION-${randomUUID()}`
  await shop.act((transaction) => saveExtensionOrder(transaction, quoted.extensionId, orderId))
  return { ...quoted, orderId }
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'extension', NOW)
  other = await readyRentalShop(database, 'other-extension', NOW)
})

describe('the most extra days a shop allows', () => {
  it('is a week for a new shop, and what the owner saves after', async () => {
    expect(await other.act(extensionMaxDays)).toBe(7)
    await other.act((transaction) => saveExtensionMaxDays(transaction, other.scope.shopId, 3))
    expect(await other.act(extensionMaxDays)).toBe(3)
  })
})

describe('quoting more days', () => {
  it('prices each started day at the rate agreed at booking and keeps the quote', async () => {
    const rental = await out()
    const quoted = await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 48), 'link', NOW))
    expect(quoted).toMatchObject({ ok: true, terms: { extraDays: 2, fee: { cents: 80_00, currency: 'EUR' }, endsAt: hours(rental.endsAt, 48) } })
    expect(await shop.act((transaction) => rentalExtensionsOf(transaction, rental.rentalId))).toMatchObject([{ state: 'quoted', extraDays: 2, amountCents: 80_00, fromEndsAt: rental.endsAt, toEndsAt: hours(rental.endsAt, 48) }])
  })

  it('lets a newer quote replace one not yet paid', async () => {
    const rental = await out()
    const first = await ordered(rental.rentalId, hours(rental.endsAt, 24))
    await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 72), 'link', NOW))
    const states = (await shop.act((transaction) => rentalExtensionsOf(transaction, rental.rentalId))).map((each) => [each.id === first.extensionId, each.state])
    expect(states).toEqual(expect.arrayContaining([[true, 'replaced'], [false, 'quoted']]))
  })

  it('refuses days another booking needs, naming when', async () => {
    const rental = await out()
    const neededFrom = hours(rental.endsAt, 10)
    const booked = await shop.act((transaction) => createBooking(transaction, shop.scope.shopId, { lines: [{ itemTypeId: shop.typeId, count: 2 }], startsAt: neededFrom, endsAt: hours(neededFrom, 5), contact: { name: 'Lea', email: 'lea@example.com' }, language: 'en', bookedThrough: 'staff', link: { fingerprint: `extension-blocker-${randomUUID()}`, expiresAt: addDays(NOW, 300) } }, NOW))
    if (!booked.ok) throw new Error(booked.reason)
    expect(await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 24), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'not_free', neededFrom } })
    expect(await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 9), 'link', NOW))).toMatchObject({ ok: true })
  })

  it('refuses an end the hold cannot cover, more days than the shop allows, and another shop’s rental', async () => {
    const rental = await out()
    await validUntil(rental.rentalId, addDays(rental.endsAt, 3))
    expect(await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 48), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'beyond_hold', latest: addDays(rental.endsAt, 1) } })
    expect(await shop.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 8 * 24), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'too_many_days', maxDays: 7 } })
    expect(await other.act((transaction) => quoteExtension(transaction, rental.rentalId, hours(rental.endsAt, 24), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'not_found' } })
  })
})

describe('the hold an extension relies on', () => {
  it('must still be placed, on an authorization PayPal still holds', async () => {
    const atRisk = await out()
    await database.update(holds).set({ state: 'at_risk' }).where(eq(holds.rentalId, atRisk.rentalId))
    expect(await shop.act((transaction) => quoteExtension(transaction, atRisk.rentalId, hours(atRisk.endsAt, 24), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'no_hold' } })
    const voided = await out()
    const [hold] = await database.select({ authorizationId: holds.currentAuthorizationId }).from(holds).where(eq(holds.rentalId, voided.rentalId))
    await database.update(authorizations).set({ state: 'voided' }).where(eq(authorizations.id, hold?.authorizationId ?? ''))
    expect(await shop.act((transaction) => quoteExtension(transaction, voided.rentalId, hours(voided.endsAt, 24), 'link', NOW))).toEqual({ ok: false, problem: { kind: 'no_hold' } })
  })
})

describe('paying for more days', () => {
  it('moves the end once PayPal shows the order approved, and queues one capture of the quoted fee', async () => {
    const rental = await out()
    const extension = await ordered(rental.rentalId, hours(rental.endsAt, 48))
    const begun = await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    expect(begun.execution).toMatchObject({ amountCents: 80_00, currency: 'EUR', orderId: extension.orderId })
    expect(await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))).toEqual(begun)
    expect((await database.select().from(rentals).where(eq(rentals.id, rental.rentalId)))[0]?.endsAt).toEqual(hours(rental.endsAt, 48))
    expect((await database.select().from(outbox)).filter((row) => row.payload['executionId'] === begun.execution.id)).toHaveLength(1)
  })

  it('refuses another rental’s order, and an order whose quote no longer matches the rental', async () => {
    const rental = await out()
    const second = await out()
    const extension = await ordered(rental.rentalId, hours(rental.endsAt, 24))
    expect(await shop.act((transaction) => beginExtensionCapture(transaction, second.rentalId, extension.orderId, NOW))).toEqual({ ok: false, reason: 'not_found' })
    await shop.act((transaction) => transaction.update(rentals).set({ endsAt: hours(rental.endsAt, 1) }).where(eq(rentals.id, rental.rentalId)))
    expect(await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))).toEqual({ ok: false, reason: 'quote_stale' })
  })

  it('records the payment once, as the extension’s own line in the money log', async () => {
    const rental = await out()
    const extension = await ordered(rental.rentalId, hours(rental.endsAt, 24))
    const begun = await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const capture = { orderId: extension.orderId, captureId: `CAPTURE-${extension.orderId}`, status: 'completed', amount: { cents: 40_00, currency: 'EUR' } }
    expect(await asWorker((transaction) => confirmExtensionCapture(transaction, begun.execution.id, capture, NOW))).toEqual({ ok: true })
    expect(await asWorker((transaction) => confirmExtensionCapture(transaction, begun.execution.id, capture, NOW))).toEqual({ ok: true })
    const lines = (await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rental.rentalId))).filter((line) => line.kind === 'extension_captured')
    expect(lines).toMatchObject([{ amountCents: 40_00, paypalReference: capture.captureId }])
    expect((await shop.act((transaction) => rentalExtensionsOf(transaction, rental.rentalId)))[0]).toMatchObject({ state: 'paid', paidAt: NOW })
    expect((await database.select().from(executions).where(eq(executions.id, begun.execution.id)))[0]?.state).toBe('confirmed')
    // Today's fees this month count the extra days with the rental fees.
    const day = shopDay('UTC', NOW)
    const later = hours(NOW, 1)
    const today = await shop.act((transaction) => shopToday(transaction, { now: later, day }))
    const thisMonth = (await database.select().from(moneyEvents).where(eq(moneyEvents.shopId, shop.scope.shopId))).filter((line) => line.occurredAt >= day.monthStart && line.occurredAt < later)
    expect(thisMonth.some((line) => line.kind === 'extension_captured')).toBe(true)
    expect(today.month.feesCents).toBe(thisMonth.filter((line) => ['fee_captured', 'extension_captured'].includes(line.kind)).reduce((sum, line) => sum + line.amountCents, 0))
  })

  it('refuses a capture that is not the quoted fee, and puts the old end back when PayPal refuses', async () => {
    const rental = await out()
    const extension = await ordered(rental.rentalId, hours(rental.endsAt, 24))
    const begun = await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    expect(await asWorker((transaction) => confirmExtensionCapture(transaction, begun.execution.id, { orderId: extension.orderId, captureId: 'X', status: 'completed', amount: { cents: 1, currency: 'EUR' } }, NOW))).toEqual({ ok: false, reason: 'amount_mismatch' })
    await asWorker((transaction) => failExtensionCapture(transaction, begun.execution.id, 'declined', NOW))
    expect((await database.select().from(rentals).where(eq(rentals.id, rental.rentalId)))[0]?.endsAt).toEqual(rental.endsAt)
    expect((await shop.act((transaction) => rentalExtensionsOf(transaction, rental.rentalId)))[0]?.state).toBe('failed')
  })
})

describe('money PayPal moved that a person must check', () => {
  it('lists a capture of another amount for the shop alone, until an owner or manager marks it checked', async () => {
    const rental = await out()
    const extension = await ordered(rental.rentalId, hours(rental.endsAt, 24))
    const begun = await shop.act((transaction) => beginExtensionCapture(transaction, rental.rentalId, extension.orderId, NOW))
    if (!begun.ok) throw new Error(begun.reason)
    const payment = { orderId: extension.orderId, captureId: `CAPTURE-${randomUUID()}`, status: 'completed', amount: { cents: 1, currency: 'EUR' } }
    await asWorker((transaction) => flagExtensionCapture(transaction, begun.execution.id, payment, NOW))
    const waiting = await shop.act((transaction) => extensionPaymentsToCheck(transaction))
    expect(waiting.filter((each) => each.rentalId === rental.rentalId)).toMatchObject([{ extensionId: extension.extensionId, attention: 'amount_mismatch', capturedCents: 1, paypalCaptureId: payment.captureId, extraDays: 1 }])
    expect(await other.act((transaction) => extensionPaymentsToCheck(transaction))).toEqual([])
    expect(await other.act((transaction) => checkExtensionPayment(transaction, extension.extensionId, other.scope.userId ?? '', NOW))).toEqual({ ok: false, reason: 'not_found' })
    expect(await shop.act((transaction) => checkExtensionPayment(transaction, extension.extensionId, shop.scope.userId ?? '', NOW))).toEqual({ ok: true, rentalId: rental.rentalId })
    expect((await shop.act((transaction) => extensionPaymentsToCheck(transaction))).map((each) => each.rentalId)).not.toContain(rental.rentalId)
    expect(await shop.act((transaction) => checkExtensionPayment(transaction, extension.extensionId, shop.scope.userId ?? '', NOW))).toEqual({ ok: false, reason: 'already_checked' })
  })
})
