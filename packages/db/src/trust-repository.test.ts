import { addDays, money } from '@hold/domain'
import type { TrustLadder } from '@hold/domain'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createBooking } from './booking-repository.ts'
import { askForHold } from './hold-repository.ts'
import { holds, moneyEvents, rentalOutcomes, rentals, renters } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import {
  answerTrustConsent,
  currentTrustLadder,
  deleteTrustRecord,
  markOutcomeOpen,
  pastRentalsForSimulation,
  publishTrustLadder,
  renterTrustKey,
  shopOutcomes,
  trustConsent,
  trustMoneyLog,
  trustOutcomes,
  writeRentalOutcome,
} from './trust-repository.ts'

const NOW = new Date('2026-10-26T09:00:00Z')
const HOUR = 3_600_000
const eur = (cents: number) => money(cents, 'EUR')
// A stand-in for the keyed hash, which lives in @hold/trust with Hold's secret.
const keyFor = (payerId: string) => `key-${payerId}`.padEnd(43, 'x')
const PRIYA = 'PAYER-PRIYA'
const PRIYA_KEY = keyFor(PRIYA)

const ladder: TrustLadder = {
  currency: 'EUR',
  history: 'network',
  windowMonths: 24,
  minimumFee: eur(10_00),
  minimumHours: 4,
  rungs: [
    { cleanReturns: 3, sharePercent: 75, largestValue: eur(2000_00), needsSavedMethod: false },
    { cleanReturns: 5, sharePercent: 50, largestValue: undefined, needsSavedMethod: false },
  ],
}

let database: TestDatabase
let shopA: ReadyRentalShop
let shopB: ReadyRentalShop

// Drizzle wraps PostgreSQL's error. The database's own message is its cause.
async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
  }
  return 'not refused'
}

const asRenter = (shop: ReadyRentalShop): Scope => ({ role: 'hold_app', shopId: shop.scope.shopId })
const actAs = <Result>(scope: Scope, work: (transaction: Transaction) => Promise<Result>) => inShop(database, scope, work)

async function outcomeAt(shop: ReadyRentalShop, outcome: 'clean' | 'settled' | 'open', overrides: Partial<typeof rentalOutcomes.$inferInsert> = {}) {
  const rentalId = await shop.paidRental(PRIYA)
  await database.insert(rentalOutcomes).values({ shopId: shop.scope.shopId, rentalId, renterKey: PRIYA_KEY, itemCategory: 'e_bike', closedAt: new Date(NOW.getTime() - 30 * 24 * HOUR), outcome, counts: true, ...overrides })
  return rentalId
}

beforeAll(async () => {
  database = await createTestDatabase()
  shopA = await readyRentalShop(database, 'trust-a', NOW)
  shopB = await readyRentalShop(database, 'trust-b', NOW)
})

describe('publishing a trust ladder', () => {
  it('publishes numbered versions, the latest of which applies, with its rungs in order', async () => {
    const userId = shopA.scope.userId ?? ''
    expect(await shopA.act((transaction) => publishTrustLadder(transaction, shopA.scope.shopId, userId, { ...ladder, history: 'own' }, NOW))).toEqual({ ok: true, version: 1 })
    expect(await shopA.act((transaction) => publishTrustLadder(transaction, shopA.scope.shopId, userId, ladder, NOW))).toEqual({ ok: true, version: 2 })
    const current = await shopA.act(currentTrustLadder)
    expect(current).toMatchObject({ version: 2, publishedAt: NOW, ladder })
  })

  it('refuses a ladder in another currency than the shop’s', async () => {
    expect(await shopA.act((transaction) => publishTrustLadder(transaction, shopA.scope.shopId, shopA.scope.userId ?? '', { ...ladder, currency: 'CHF', minimumFee: money(0, 'CHF'), rungs: [] }, NOW))).toEqual({ ok: false, reason: 'currency_mismatch' })
  })

  it('cannot be changed once published', async () => {
    expect(await refusal(shopA.act((transaction) => transaction.execute(sql`update trust_ladders set window_months = 1`)))).toMatch(/permission denied/)
  })

  it('is not seen by another shop', async () => {
    expect(await shopB.act(currentTrustLadder)).toBeUndefined()
  })
})

describe('the renter key', () => {
  it('is kept on the renter once, from the payer PayPal named', async () => {
    const rentalId = await shopA.paidRental(PRIYA)
    expect(await shopA.act((transaction) => renterTrustKey(transaction, rentalId, keyFor))).toBe(PRIYA_KEY)
    expect(await shopA.act((transaction) => renterTrustKey(transaction, rentalId, () => 'another'.padEnd(43, 'y')))).toBe(PRIYA_KEY)
  })

  it('is nothing for a rental nobody has paid for', async () => {
    const created = await shopA.act((transaction) =>
      createBooking(transaction, shopA.scope.shopId, { lines: [{ itemTypeId: shopA.typeId, count: 1 }], startsAt: new Date(NOW.getTime() + 900 * HOUR), endsAt: new Date(NOW.getTime() + 924 * HOUR), contact: undefined, language: 'en', bookedThrough: 'staff', link: { fingerprint: 'trust-unpaid', expiresAt: addDays(NOW, 300) } }, NOW),
    )
    if (!created.ok) throw new Error(created.reason)
    expect(await shopA.act((transaction) => renterTrustKey(transaction, created.rentalId, keyFor))).toBeUndefined()
  })

  it('cannot be set on another shop’s renter', async () => {
    const rentalId = await shopA.paidRental('PAYER-ELSEWHERE')
    const [renter] = await database.select({ id: renters.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, rentalId))
    const set = await shopB.act((transaction) => transaction.select({ set: sql<boolean>`result.set` }).from(sql`hold_set_renter_trust_key(${renter?.id ?? ''}::uuid, ${'planted'.padEnd(43, 'z')}) as result(set)`))
    expect(set).toEqual([{ set: false }])
  })
})

describe('a renter’s outcomes across shops', () => {
  beforeAll(async () => {
    const atB = await shopB.paidRental(PRIYA)
    await shopB.act((transaction) => renterTrustKey(transaction, atB, keyFor))
    for (let index = 0; index < 5; index += 1) await outcomeAt(shopA, 'clean')
    await outcomeAt(shopB, 'settled')
  })

  it('shows a shop its own outcomes only, without the renter’s consent', async () => {
    const seen = await shopB.act((transaction) => trustOutcomes(transaction, PRIYA_KEY))
    expect(seen.map((row) => row.outcome)).toEqual(['settled'])
    expect(seen.every((row) => row.here)).toBe(true)
  })

  it('shows the renter, through their link, their whole record, naming no shop', async () => {
    const seen = await actAs(asRenter(shopB), (transaction) => trustOutcomes(transaction, PRIYA_KEY))
    expect(seen.filter((row) => row.outcome === 'clean')).toHaveLength(5)
    expect(new Set(seen.map((row) => row.shop)).size).toBe(2)
    for (const row of seen) expect(row.shop).toMatch(/^\d+$/)
  })

  it('shows another shop’s outcomes once the renter consents through their link, and not after they withdraw', async () => {
    expect(await shopB.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toEqual({ answered: false, consented: false })
    expect(await actAs(asRenter(shopB), (transaction) => answerTrustConsent(transaction, PRIYA_KEY, true, NOW))).toBe(true)
    expect(await shopB.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toEqual({ answered: true, consented: true })
    expect((await shopB.act((transaction) => trustOutcomes(transaction, PRIYA_KEY))).filter((row) => row.outcome === 'clean')).toHaveLength(5)
    expect(await actAs(asRenter(shopB), (transaction) => answerTrustConsent(transaction, PRIYA_KEY, false, NOW))).toBe(true)
    expect(await shopB.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toEqual({ answered: true, consented: false })
    expect((await shopB.act((transaction) => trustOutcomes(transaction, PRIYA_KEY))).map((row) => row.outcome)).toEqual(['settled'])
  })

  it('never lets staff answer for the renter', async () => {
    expect(await shopB.act((transaction) => answerTrustConsent(transaction, PRIYA_KEY, true, NOW))).toBe(false)
    expect(await shopB.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toEqual({ answered: true, consented: false })
  })

  it('tells a shop that never served the renter nothing at all', async () => {
    const shopC = await readyRentalShop(database, 'trust-c', NOW)
    expect(await shopC.act((transaction) => trustOutcomes(transaction, PRIYA_KEY))).toEqual([])
    expect(await actAs(asRenter(shopC), (transaction) => trustOutcomes(transaction, PRIYA_KEY))).toEqual([])
    expect(await shopC.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toBeUndefined()
    expect(await actAs(asRenter(shopC), (transaction) => answerTrustConsent(transaction, PRIYA_KEY, true, NOW))).toBe(false)
    expect(await actAs(asRenter(shopC), (transaction) => deleteTrustRecord(transaction, PRIYA_KEY, NOW))).toBeUndefined()
  })

  it('keeps consents out of every service role’s direct reach', async () => {
    expect(await refusal(shopA.act((transaction) => transaction.execute(sql`select * from renter_consents`)))).toMatch(/permission denied/)
    expect(await refusal(actAs(asRenter(shopA), (transaction) => transaction.execute(sql`insert into renter_consents (renter_key, purpose, answered_at) values ('x', 'network_history', now())`)))).toMatch(/permission denied/)
  })

  it('lets a shop read and write only its own outcome rows', async () => {
    const seen = await shopB.act((transaction) => transaction.select().from(rentalOutcomes))
    expect(seen.every((row) => row.shopId === shopB.scope.shopId)).toBe(true)
    const [elsewhere] = await database.select().from(rentalOutcomes).where(eq(rentalOutcomes.shopId, shopA.scope.shopId))
    expect(await refusal(shopB.act((transaction) => transaction.insert(rentalOutcomes).values({ ...(elsewhere ?? { shopId: '', rentalId: '', renterKey: '', itemCategory: 'other', closedAt: NOW, outcome: 'clean', counts: true }), id: undefined, shopId: shopA.scope.shopId })))).toMatch(/row-level security/)
  })

  it('lets the renter, and only the renter, delete their clean and settled returns at every shop, but not an open claim', async () => {
    await outcomeAt(shopB, 'open', { unpaidAfter: new Date(NOW.getTime() - HOUR) })
    expect(await shopB.act((transaction) => deleteTrustRecord(transaction, PRIYA_KEY, NOW))).toBeUndefined()
    expect(await actAs(asRenter(shopA), (transaction) => answerTrustConsent(transaction, PRIYA_KEY, true, NOW))).toBe(true)
    expect(await actAs(asRenter(shopB), (transaction) => deleteTrustRecord(transaction, PRIYA_KEY, NOW))).toBe(6)
    expect((await actAs(asRenter(shopB), (transaction) => trustOutcomes(transaction, PRIYA_KEY))).map((row) => row.outcome)).toEqual(['open'])
    expect(await shopB.act((transaction) => trustConsent(transaction, PRIYA_KEY))).toEqual({ answered: true, consented: false })
  })
})

describe('the outcome a closed rental writes', () => {
  async function priya(shop: ReadyRentalShop): Promise<string> {
    const rentalId = await shop.paidRental(PRIYA)
    await shop.act((transaction) => renterTrustKey(transaction, rentalId, keyFor))
    return rentalId
  }
  const outcomeOf = async (rentalId: string) => (await database.select().from(rentalOutcomes).where(eq(rentalOutcomes.rentalId, rentalId)))[0]
  const logged = (shop: ReadyRentalShop, rentalId: string, kind: 'hold_captured' | 'invoice_paid' | 'refunded' | 'hold_released', cents: number) =>
    database.insert(moneyEvents).values({ shopId: shop.scope.shopId, rentalId, kind, currency: 'EUR', amountCents: cents, paypalReference: `${kind}-${rentalId}-${String(cents)}`, occurredAt: NOW })

  it('is clean when nothing was taken, and counts when the fee was captured above the shop’s minimums', async () => {
    const rentalId = await priya(shopA)
    await shopA.act((transaction) => writeRentalOutcome(transaction, rentalId, NOW))
    expect(await outcomeOf(rentalId)).toMatchObject({ renterKey: PRIYA_KEY, outcome: 'clean', counts: true, itemCategory: 'e_bike', closedAt: NOW, unpaidAfter: null })
  })

  it('is settled when a claim was paid, and clean again when the charge was refunded in full', async () => {
    const paid = await priya(shopA)
    await logged(shopA, paid, 'hold_captured', 35_00)
    await shopA.act((transaction) => writeRentalOutcome(transaction, paid, NOW))
    expect(await outcomeOf(paid)).toMatchObject({ outcome: 'settled' })
    const refunded = await priya(shopA)
    await logged(shopA, refunded, 'hold_captured', 35_00)
    await logged(shopA, refunded, 'refunded', 35_00)
    await shopA.act((transaction) => writeRentalOutcome(transaction, refunded, NOW))
    expect(await outcomeOf(refunded)).toMatchObject({ outcome: 'clean' })
  })

  it('does not count a rental below the shop’s minimum fee', async () => {
    await shopA.act((transaction) => publishTrustLadder(transaction, shopA.scope.shopId, shopA.scope.userId ?? '', { ...ladder, minimumFee: eur(50_00) }, NOW))
    const rentalId = await priya(shopA)
    await shopA.act((transaction) => writeRentalOutcome(transaction, rentalId, NOW))
    expect(await outcomeOf(rentalId)).toMatchObject({ counts: false })
    await shopA.act((transaction) => publishTrustLadder(transaction, shopA.scope.shopId, shopA.scope.userId ?? '', ladder, NOW))
  })

  it('writes nothing for a renter with no key', async () => {
    const rentalId = await shopA.paidRental('PAYER-NO-KEY')
    await shopA.act((transaction) => writeRentalOutcome(transaction, rentalId, NOW))
    expect(await outcomeOf(rentalId)).toBeUndefined()
  })

  it('is open while an invoice for a decided claim is unpaid, falling due a month on, and settled once paid', async () => {
    const rentalId = await priya(shopA)
    await shopA.act((transaction) => markOutcomeOpen(transaction, rentalId, NOW))
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'open', unpaidAfter: addDays(NOW, 30) })
    await logged(shopA, rentalId, 'invoice_paid', 60_00)
    await shopA.act((transaction) => writeRentalOutcome(transaction, rentalId, NOW))
    expect(await outcomeOf(rentalId)).toMatchObject({ outcome: 'settled', unpaidAfter: null })
  })

  it('appears in the shop’s own ledger', async () => {
    const ledger = await shopA.act((transaction) => shopOutcomes(transaction, NOW))
    expect(ledger.length).toBeGreaterThan(0)
    expect(await shopB.act((transaction) => shopOutcomes(transaction, NOW))).not.toContainEqual(expect.objectContaining({ rentalId: ledger[0]?.rentalId }))
  })
})

describe('the money log a renter reads', () => {
  it('lists the holds released and captured for their rentals, through their link only', async () => {
    const rentalId = await shopB.paidRental(PRIYA)
    await database.insert(moneyEvents).values({ shopId: shopB.scope.shopId, rentalId, kind: 'hold_released', currency: 'EUR', amountCents: 300_00, paypalReference: `released-${rentalId}`, occurredAt: NOW })
    const lines = await actAs(asRenter(shopB), (transaction) => trustMoneyLog(transaction, PRIYA_KEY))
    expect(lines).toContainEqual({ rental: rentalId, kind: 'hold_released', amount: eur(300_00) })
    expect(await shopB.act((transaction) => trustMoneyLog(transaction, PRIYA_KEY))).toEqual([])
  })
})

describe('the hold asked for under a ladder', () => {
  it('reserves the lowered amount and remembers the ordinary hold, the ladder version and the rung', async () => {
    const rentalId = await shopA.paidRental(PRIYA)
    const current = await shopA.act(currentTrustLadder)
    const trust = { reservedCents: 150_00, ordinaryCents: 300_00, ladderId: current?.id ?? '', rung: 2, cleanReturns: 5 }
    await shopA.act((transaction) => askForHold(transaction, rentalId, NOW, trust))
    expect((await database.select().from(holds).where(eq(holds.rentalId, rentalId)))[0]).toMatchObject({ reservedCents: 150_00, ordinaryCents: 300_00, trustLadderId: current?.id, trustRung: 2, cleanReturns: 5 })
    expect((await database.select().from(rentals).where(eq(rentals.id, rentalId)))[0]).toMatchObject({ trustLadderId: current?.id, trustRung: 2 })
  })

  it('never reserves more than the hold agreed at booking, whatever it is given', async () => {
    const rentalId = await shopA.paidRental(PRIYA)
    await shopA.act((transaction) => askForHold(transaction, rentalId, NOW, { reservedCents: 900_00, ordinaryCents: 900_00, ladderId: '', rung: 0, cleanReturns: 0 }))
    expect((await database.select().from(holds).where(eq(holds.rentalId, rentalId)))[0]).toMatchObject({ reservedCents: 300_00, ordinaryCents: 300_00, trustLadderId: null, trustRung: null })
  })
})

describe('replaying a ladder', () => {
  it('reads the shop’s closed rentals with what was taken for each from the money log', async () => {
    const rentalId = await shopA.paidRental(PRIYA)
    await database.update(rentals).set({ state: 'closed' }).where(eq(rentals.id, rentalId))
    await database.insert(moneyEvents).values({ shopId: shopA.scope.shopId, rentalId, kind: 'hold_captured', currency: 'EUR', amountCents: 80_00, paypalReference: `sim-${rentalId}`, occurredAt: NOW })
    const past = await shopA.act(pastRentalsForSimulation)
    expect(past.find((rental) => rental.claimCents === 80_00)).toMatchObject({ outcome: 'settled', feeCaptured: true, fee: eur(40_00), hours: 24, items: [{ hold: eur(300_00), value: eur(2400_00) }] })
    expect(await shopB.act(pastRentalsForSimulation)).toEqual([])
  })
})
