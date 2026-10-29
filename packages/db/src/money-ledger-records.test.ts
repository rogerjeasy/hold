import { money } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { moneyLedgerRecords } from './money-ledger-records.ts'
import type { MoneyLedgerRecords } from './money-ledger-records.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { executions, paypalAccounts, paypalEvents, shopExceptions } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// What the money ledger reads (extensions.md section 12.5): every line of the shop's money log with the rental it
// belongs to, the read-back and the verified PayPal event that confirm it, the hold and the approved claim it is
// checked against, whether the operations agent found PayPal's record different, and the rental's audit trail.

const NOW = new Date('2026-10-14T09:12:00Z')
const TIME_ZONE = 'Europe/Lisbon'
let database: TestDatabase
let shop: Scope
let other: Scope

async function owner(subject: string, name: string): Promise<Scope> {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: TIME_ZONE } })
  return { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
}

const read = (scope: Scope) => inShop(database, scope, (transaction) => moneyLedgerRecords(transaction))

function capturedRental(records: MoneyLedgerRecords) {
  const capture = records.lines.find((line) => line.kind === 'hold_captured')
  if (capture === undefined) throw new Error('No sample rental was captured.')
  return capture.rentalId
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-ledger', 'Ribeira Bikes')
  other = await owner('owner-ledger-other', 'Douro Kayaks')
  const priceList = {
    currency: 'EUR',
    ownerApprovalThreshold: undefined,
    entries: [
      { description: 'Deep scratch on the frame', category: 'damage' as const, amount: money(35_00, 'EUR') },
      { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') },
    ],
    wearPolicy: 'Light scuffs are ordinary wear.',
  }
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, priceList, NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId ?? '', timeZone: TIME_ZONE, now: NOW }))
})

describe('the records the money ledger reads', () => {
  it('lists every line of the money log with its rental, in the order money moved, a capture before the release it made', async () => {
    const records = await read(shop)
    expect(records.lines.length).toBeGreaterThan(0)
    for (const line of records.lines) expect(records.rentals.some((rental) => rental.rentalId === line.rentalId)).toBe(true)
    const rentalId = capturedRental(records)
    expect(records.lines.filter((line) => line.rentalId === rentalId).map((line) => line.kind)).toEqual(['fee_captured', 'hold_placed', 'hold_captured', 'hold_released'])
    const times = records.lines.map((line) => line.occurredAt.getTime())
    expect(times).toEqual([...times].sort((first, second) => first - second))
  })

  it('gives each rental its renter, its hold as it stands and the total of the claim a person approved', async () => {
    const records = await read(shop)
    const rental = records.rentals.find((each) => each.rentalId === capturedRental(records))
    const captured = records.lines.find((line) => line.rentalId === rental?.rentalId && line.kind === 'hold_captured')
    expect(rental).toMatchObject({ currency: 'EUR', simulated: true, holdState: 'captured', claimCents: captured?.amountCents, paypalDiffers: false })
    expect(rental?.renterName).toEqual(expect.any(String))
    expect(rental?.reservedCents).toBeGreaterThan(captured?.amountCents ?? 0)
    // A rental whose claim nobody approved yet has no claim total to be checked against.
    expect(records.rentals.some((each) => each.holdState === 'placed' && each.claimCents === null)).toBe(true)
  })

  it('confirms a line with the read-back of its execution and the verified PayPal event about the same resource, never one whose signature failed', async () => {
    const records = await read(shop)
    const capture = records.lines.find((line) => line.kind === 'hold_captured')
    if (capture === undefined) throw new Error('No capture.')
    const [account] = await database.insert(paypalAccounts).values({ shopId: shop.shopId, credentialReference: 'hold/paypal/ledger', mode: 'sandbox' }).returning({ id: paypalAccounts.id })
    const resource = { resource: { id: capture.paypalReference, status: 'COMPLETED' } }
    await database.insert(paypalEvents).values([
      { shopId: shop.shopId, paypalAccountId: account?.id ?? '', paypalEventId: 'WH-FORGED', type: 'PAYMENT.CAPTURE.REVERSED', rawBody: JSON.stringify(resource), headers: {}, verification: 'rejected', receivedAt: new Date('2026-10-13T08:00:00Z') },
      { shopId: shop.shopId, paypalAccountId: account?.id ?? '', paypalEventId: 'WH-1', type: 'PAYMENT.CAPTURE.COMPLETED', rawBody: JSON.stringify(resource), headers: {}, verification: 'verified', receivedAt: new Date('2026-10-13T09:00:00Z') },
    ])
    await database.insert(executions).values({ shopId: shop.shopId, rentalId: capture.rentalId, action: 'capture', idempotencyKey: `capture:${capture.rentalId}`, currency: 'EUR', amountCents: capture.amountCents, paypalResourceIds: { captureId: capture.paypalReference }, state: 'confirmed', attempts: 2 })
    const confirmed = (await read(shop)).lines.find((line) => line.id === capture.id)
    expect(confirmed?.event).toEqual({ type: 'PAYMENT.CAPTURE.COMPLETED', eventId: 'WH-1', receivedAt: new Date('2026-10-13T09:00:00Z'), simulated: false })
    expect(confirmed?.execution).toEqual({ action: 'capture', idempotencyKey: `capture:${capture.rentalId}`, attempts: 2 })
    expect((await read(shop)).lines.find((line) => line.kind === 'fee_captured')?.event).toBeNull()
  })

  it('marks a rental whose hold PayPal records differently, until the difference is resolved', async () => {
    const records = await read(shop)
    const rental = records.rentals.find((each) => each.holdState === 'placed')
    if (rental === undefined) throw new Error('No placed hold.')
    await database.insert(shopExceptions).values({ shopId: shop.shopId, kind: 'reconciliation_difference', subjectKind: 'hold', subjectId: rental.rentalId, rentalId: rental.rentalId, fingerprint: `difference:${rental.rentalId}`, detectedAt: NOW })
    expect((await read(shop)).rentals.find((each) => each.rentalId === rental.rentalId)?.paypalDiffers).toBe(true)
    await database.insert(shopExceptions).values({ shopId: shop.shopId, kind: 'reconciliation_difference', subjectKind: 'hold', subjectId: 'other', rentalId: capturedRental(records), fingerprint: 'difference:resolved', detectedAt: NOW, resolvedAt: NOW })
    expect((await read(shop)).rentals.find((each) => each.rentalId === capturedRental(records))?.paypalDiffers).toBe(false)
  })

  it('gives each rental its audit trail, oldest first', async () => {
    const records = await read(shop)
    const rental = records.rentals.find((each) => each.rentalId === capturedRental(records))
    expect(rental?.audit.map((line) => line.action)).toContain('hold.released')
    const times = rental?.audit.map((line) => line.at.getTime()) ?? []
    expect(times).toEqual([...times].sort((first, second) => first - second))
  })

  it('shows another shop nothing of this one', async () => {
    expect(await read(other)).toEqual({ lines: [], rentals: [] })
  })
})
