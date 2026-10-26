import { answerTrustConsent, deleteTrustRecord, inShop, moneyEvents, publishTrustLadder, rentalOutcomes, renterTrustKey, writeRentalOutcome } from '@hold/db'
import type { Scope, Transaction } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import type { ReadyRentalShop } from '@hold/db/testing/ready-rental'
import { money } from '@hold/domain'
import type { TrustLadder } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renterRecord, trustedHold } from './record.ts'
import { renterKeyFor } from './renter-key.ts'

const NOW = new Date('2026-10-26T09:00:00Z')
const DAY = 86_400_000
const eur = (cents: number) => money(cents, 'EUR')
const keyFor = renterKeyFor(Buffer.alloc(32, 8))

// The example ladder in extensions.md section 7.5, in euros.
const ladder: TrustLadder = {
  currency: 'EUR',
  history: 'network',
  windowMonths: 24,
  minimumFee: eur(0),
  minimumHours: 0,
  rungs: [
    { cleanReturns: 3, sharePercent: 75, largestValue: eur(3000_00), needsSavedMethod: false },
    { cleanReturns: 5, sharePercent: 50, largestValue: eur(3000_00), needsSavedMethod: false },
    { cleanReturns: 10, sharePercent: 0, largestValue: eur(1000_00), needsSavedMethod: true },
  ],
}

let database: TestDatabase
let shopA: ReadyRentalShop
let shopB: ReadyRentalShop
let payer = 0
let renter: string
let renterKey: string

const asRenter = (shop: ReadyRentalShop): Scope => ({ role: 'hold_app', shopId: shop.scope.shopId })
const actAs = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)

// A rental the renter paid at the shop, its renter key kept, as asking for the hold at pickup does.
async function rentedAt(shop: ReadyRentalShop): Promise<string> {
  const rentalId = await shop.paidRental(renter)
  await shop.act((transaction) => renterTrustKey(transaction, rentalId, keyFor))
  return rentalId
}

// Returns closed at the shop with nothing taken, written as closing a rental writes them.
async function cleanReturnsAt(shop: ReadyRentalShop, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const rentalId = await rentedAt(shop)
    await shop.act((transaction) => writeRentalOutcome(transaction, rentalId, new Date(NOW.getTime() - (index + 1) * 30 * DAY)))
  }
}

// What staff at the shop are offered when they ask for the hold at pickup.
async function holdOffered(shop: ReadyRentalShop) {
  const rentalId = await rentedAt(shop)
  return shop.act((transaction) => trustedHold(transaction, rentalId, renterKey, NOW))
}

beforeAll(async () => {
  database = await createTestDatabase()
  shopA = await readyRentalShop(database, 'record-a', NOW)
  shopB = await readyRentalShop(database, 'record-b', NOW)
  await shopB.act((transaction) => publishTrustLadder(transaction, shopB.scope.shopId, shopB.scope.userId ?? '', ladder, NOW))
})

beforeEach(() => {
  payer += 1
  renter = `PAYER-RECORD-${String(payer)}`
  renterKey = keyFor(renter)
})

describe('the hold a renter is offered at another Hold shop', () => {
  it('is the ladder’s amount, with the rung and the returns behind it, once the renter consents (X2.1)', async () => {
    await cleanReturnsAt(shopA, 5)
    const consentedAt = await rentedAt(shopA)
    expect(consentedAt).toBeTruthy()
    expect(await actAs(asRenter(shopA), (transaction) => answerTrustConsent(transaction, renterKey, true, NOW))).toBe(true)
    const offered = await holdOffered(shopB)
    expect(offered).toMatchObject({ reservedCents: 150_00, ordinaryCents: 300_00, rung: 2, cleanReturns: 5 })
  })

  it('is the ordinary hold without the renter’s consent (X2.2)', async () => {
    await cleanReturnsAt(shopA, 5)
    expect(await holdOffered(shopB)).toBeUndefined()
  })

  it('is the ordinary hold at a shop that counts its own history only, whatever the renter consented to', async () => {
    const shopC = await readyRentalShop(database, `record-c-${String(payer)}`, NOW)
    await shopC.act((transaction) => publishTrustLadder(transaction, shopC.scope.shopId, shopC.scope.userId ?? '', { ...ladder, history: 'own' }, NOW))
    await cleanReturnsAt(shopA, 5)
    await rentedAt(shopC)
    expect(await actAs(asRenter(shopC), (transaction) => answerTrustConsent(transaction, renterKey, true, NOW))).toBe(true)
    expect(await holdOffered(shopC)).toBeUndefined()
  })

  it('counts the shop’s own returns without any consent', async () => {
    await cleanReturnsAt(shopB, 3)
    expect(await holdOffered(shopB)).toMatchObject({ reservedCents: 225_00, rung: 1, cleanReturns: 3 })
  })

  it('returns to the ordinary hold once the renter deletes their record (X2.6)', async () => {
    await cleanReturnsAt(shopB, 5)
    expect(await holdOffered(shopB)).toMatchObject({ reservedCents: 150_00 })
    expect(await actAs(asRenter(shopB), (transaction) => deleteTrustRecord(transaction, renterKey, NOW))).toBe(5)
    expect(await holdOffered(shopB)).toBeUndefined()
  })

  it('loses its reduction while a decided claim is unpaid, and gets it back once it is paid (X2.7)', async () => {
    await cleanReturnsAt(shopB, 5)
    const owed = await rentedAt(shopB)
    await database.insert(rentalOutcomes).values({ shopId: shopB.scope.shopId, rentalId: owed, renterKey, itemCategory: 'e_bike', closedAt: new Date(NOW.getTime() - 40 * DAY), outcome: 'open', counts: true, unpaidAfter: new Date(NOW.getTime() - 10 * DAY) })
    expect(await holdOffered(shopB)).toBeUndefined()
    await database.insert(moneyEvents).values({ shopId: shopB.scope.shopId, rentalId: owed, kind: 'invoice_paid', currency: 'EUR', amountCents: 80_00, paypalReference: `paid-${owed}`, occurredAt: NOW })
    await shopB.act((transaction) => writeRentalOutcome(transaction, owed, NOW))
    expect((await database.select().from(rentalOutcomes).where(eq(rentalOutcomes.rentalId, owed)))[0]?.outcome).toBe('settled')
    expect(await holdOffered(shopB)).toMatchObject({ reservedCents: 150_00, cleanReturns: 5 })
  })

  it('is the ordinary hold for a renter PayPal has not named, or with no ladder published', async () => {
    const rentalId = await shopB.paidRental(renter)
    expect(await shopB.act((transaction) => trustedHold(transaction, rentalId, undefined, NOW))).toBeUndefined()
    await cleanReturnsAt(shopA, 5)
    const atA = await rentedAt(shopA)
    expect(await shopA.act((transaction) => trustedHold(transaction, atA, renterKey, NOW))).toBeUndefined()
  })
})

describe('the renter’s own record', () => {
  it('counts every shop’s returns, names how many shops, and adds the deposits never taken from them (X2.8)', async () => {
    await cleanReturnsAt(shopA, 2)
    await cleanReturnsAt(shopB, 1)
    const released = await rentedAt(shopB)
    const captured = await rentedAt(shopB)
    const log = (rentalId: string, kind: 'hold_released' | 'hold_captured', cents: number) => database.insert(moneyEvents).values({ shopId: shopB.scope.shopId, rentalId, kind, currency: 'EUR', amountCents: cents, paypalReference: `${kind}-${rentalId}`, occurredAt: NOW })
    await log(released, 'hold_released', 300_00)
    await log(captured, 'hold_captured', 50_00)
    const own = await actAs(asRenter(shopB), (transaction) => renterRecord(transaction, renterKey, NOW))
    expect(own.record).toEqual({ clean: 3, settled: 0, unpaid: 0, open: 0, shops: 2, windowMonths: 24 })
    expect(own.neverTaken).toEqual([{ amount: eur(300_00), rentals: 1 }])
    expect(own.consent).toEqual({ answered: false, consented: false })
  })
})
