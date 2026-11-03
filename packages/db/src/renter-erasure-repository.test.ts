import { ERASED } from '@hold/domain'
import { eq, inArray, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { rentalDetail } from './booking-repository.ts'
import { recordText } from './renter-contact-repository.ts'
import { eraseRenter } from './renter-erasure-repository.ts'
import { auditLog, moneyEvents, rentals, renters, textMessages } from './schema/index.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-04T10:00:00Z')
const LATER = new Date('2026-11-20T10:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

// Rentals end through the settling flow; here they are moved straight to their end, as the table's owner.
async function ended(rentalId: string, state: 'closed' | 'cancelled' | 'abandoned' = 'closed') {
  await database.update(rentals).set({ state }).where(eq(rentals.id, rentalId))
}

async function withPhone(rentalId: string) {
  await database.update(rentals).set({ contactChannel: 'text', contactPhone: '+351912345678', phoneConfirmedAt: NOW, phoneCodeHash: 'hash' }).where(eq(rentals.id, rentalId))
  await shop.act((transaction) => recordText(transaction, { rentalId, purpose: 'renter_link', toPhone: '+351912345678', status: 'simulated', providerMessageId: null, body: 'Priya, your rental: https://hold.example/r/abc', failure: null }, NOW))
}

const personal = (rentalId: string) =>
  database.select({ contactName: rentals.contactName, contactEmail: rentals.contactEmail, contactPhone: rentals.contactPhone, contactChannel: rentals.contactChannel, phoneCodeHash: rentals.phoneCodeHash, phoneConfirmedAt: rentals.phoneConfirmedAt, renterErasedAt: rentals.renterErasedAt }).from(rentals).where(eq(rentals.id, rentalId)).then(([row]) => row)

const renterOf = (rentalId: string) =>
  database.select({ email: renters.email, name: renters.name }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, rentalId)).then(([row]) => row)

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'erasure', NOW)
  other = await readyRentalShop(database, 'other-erasure', NOW)
})

describe('erasing a renter’s personal details', () => {
  it('replaces the name, email and phone on every one of their ended rentals in the shop, and its texts’ numbers', async () => {
    const first = await shop.paidRental('PAYER-ERASE-ALL')
    const second = await shop.paidRental('PAYER-ERASE-ALL')
    await withPhone(second)
    await ended(first)
    await ended(second, 'cancelled')
    expect(await shop.act((transaction) => eraseRenter(transaction, first, LATER))).toEqual({ ok: true, rentals: 2 })
    for (const rentalId of [first, second]) {
      expect(await personal(rentalId)).toEqual({ contactName: ERASED, contactEmail: ERASED, contactPhone: null, contactChannel: 'email', phoneCodeHash: null, phoneConfirmedAt: null, renterErasedAt: LATER })
    }
    expect(await database.select({ toPhone: textMessages.toPhone, body: textMessages.body }).from(textMessages).where(eq(textMessages.rentalId, second))).toEqual([{ toPhone: ERASED, body: ERASED }])
  })

  it('stops the shop seeing the name and email PayPal gave, and removes them once no shop holds an unerased rental', async () => {
    const rentalId = await shop.paidRental('PAYER-ERASE-SOLE')
    await ended(rentalId)
    expect((await shop.act((transaction) => rentalDetail(transaction, rentalId, LATER)))?.renterName).toBe('Priya Natarajan')
    await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))
    const seen = await shop.act((transaction) => rentalDetail(transaction, rentalId, LATER))
    expect(seen?.renterName).toBeNull()
    expect(seen?.renterErasedAt).toEqual(LATER)
    expect(await renterOf(rentalId)).toEqual({ email: ERASED, name: ERASED })
  })

  it('keeps every money event and audit line as they were', async () => {
    const { rentalId } = await shop.readyRental()
    await ended(rentalId)
    const money = await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
    const audit = await database.select().from(auditLog).where(eq(auditLog.shopId, shop.scope.shopId))
    expect(money.length).toBeGreaterThan(0)
    await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))
    expect(await database.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))).toEqual(money)
    expect(await database.select().from(auditLog).where(eq(auditLog.shopId, shop.scope.shopId))).toEqual(audit)
  })

  it('waits while any of the renter’s rentals in the shop is still open, and changes nothing', async () => {
    const done = await shop.paidRental('PAYER-ERASE-OPEN')
    const open = await shop.paidRental('PAYER-ERASE-OPEN')
    await ended(done)
    expect(await shop.act((transaction) => eraseRenter(transaction, done, LATER))).toEqual({ ok: false, reason: 'rental_open' })
    expect((await personal(done))?.contactName).toBe('Priya')
    expect((await personal(open))?.renterErasedAt).toBeNull()
  })

  it('cannot be done twice', async () => {
    const rentalId = await shop.paidRental('PAYER-ERASE-TWICE')
    await ended(rentalId)
    await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))
    expect(await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))).toEqual({ ok: false, reason: 'already_erased' })
  })

  it('is refused for another shop’s rental, which keeps its details', async () => {
    const rentalId = await other.paidRental('PAYER-ERASE-ELSEWHERE')
    await ended(rentalId)
    expect(await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))).toEqual({ ok: false, reason: 'not_found' })
    expect(await shop.act((transaction) => eraseRenter(transaction, 'not-a-rental', LATER))).toEqual({ ok: false, reason: 'not_found' })
    expect((await personal(rentalId))?.contactName).toBe('Priya')
  })

  it('leaves the PayPal name and email to another shop that still holds the renter’s rental', async () => {
    const here = await shop.paidRental('PAYER-ERASE-SHARED')
    const there = await other.paidRental('PAYER-ERASE-SHARED')
    await ended(here)
    await shop.act((transaction) => eraseRenter(transaction, here, LATER))
    expect(await renterOf(there)).toEqual({ email: 'priya@example.com', name: 'Priya Natarajan' })
    expect((await other.act((transaction) => rentalDetail(transaction, there, LATER)))?.renterName).toBe('Priya Natarajan')
    await ended(there)
    expect(await other.act((transaction) => eraseRenter(transaction, there, LATER))).toEqual({ ok: true, rentals: 1 })
    expect(await renterOf(there)).toEqual({ email: ERASED, name: ERASED })
  })

  it('cannot be undone, nor an erased rental’s details written again', async () => {
    const rentalId = await shop.paidRental('PAYER-ERASE-UNDO')
    await ended(rentalId)
    await shop.act((transaction) => eraseRenter(transaction, rentalId, LATER))
    await expect(shop.act((transaction) => transaction.update(rentals).set({ renterErasedAt: null }).where(eq(rentals.id, rentalId)))).rejects.toThrow()
    await expect(shop.act((transaction) => transaction.update(rentals).set({ contactEmail: 'priya@example.com' }).where(eq(rentals.id, rentalId)))).rejects.toThrow()
  })

  it('can mark only an ended rental erased', async () => {
    const rentalId = await shop.paidRental('PAYER-ERASE-EARLY')
    await expect(shop.act((transaction) => transaction.update(rentals).set({ renterErasedAt: LATER }).where(eq(rentals.id, rentalId)))).rejects.toThrow()
  })

  it('gives the service role no way to write a renter’s PayPal details, nor to erase a renter the shop has not', async () => {
    const rentalId = await shop.paidRental('PAYER-ERASE-DIRECT')
    const [row] = await database.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, rentalId))
    const renterId = row?.renterId ?? ''
    await expect(shop.act((transaction) => transaction.update(renters).set({ email: ERASED }).where(inArray(renters.id, [renterId])))).rejects.toThrow()
    await shop.act((transaction) => transaction.execute(sql`select hold_erase_renter_identity(${renterId}::uuid)`))
    expect(await renterOf(rentalId)).toEqual({ email: 'priya@example.com', name: 'Priya Natarajan' })
  })
})
