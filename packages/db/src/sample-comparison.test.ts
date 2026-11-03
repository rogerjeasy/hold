import { money } from '@hold/domain'
import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { comparisonReport } from './comparison-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { COMPARISONS_QUEUE, rentalReturns } from './return-repository.ts'
import { startSampleComparison } from './sample-comparison.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { outbox, renters, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// One sample return waits for its comparison, so a judge can have Claude compare the demonstration's photographs
// without a PayPal login (architecture.md section 20.3). Nothing about it moves money.
const NOW = new Date('2026-10-14T09:12:00Z')
let database: TestDatabase
let shop: Scope & { readonly userId: string }

const rentalOf = async (renter: string) => {
  const [row] = await inShop(database, shop, (transaction) => transaction.select({ id: rentals.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, renter)))
  if (row === undefined) throw new Error(`No sample rental for ${renter}.`)
  return row.id
}
const queued = (comparisonId: string) => inShop(database, shop, (transaction) => transaction.select().from(outbox).where(and(eq(outbox.queue, COMPARISONS_QUEUE), sql`${outbox.payload} ->> 'comparisonId' = ${comparisonId}`)))

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner-sample-comparison', email: 'owner-sample-comparison@shop.example', name: 'Tomás', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shop = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  const entries = [{ description: 'Scratch on the frame, through the paint', category: 'damage' as const, amount: money(35_00, 'EUR') }, { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') }]
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries, wearPolicy: 'Light scuffs are ordinary wear.' }, NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: 'Europe/Lisbon', now: NOW }))
})

describe('the sample return that waits for its comparison', () => {
  it('has sealed handover and return photographs and a comparison nobody has started', async () => {
    const rentalId = await rentalOf('Marco Rossi')
    const [returned] = await inShop(database, shop, (transaction) => rentalReturns(transaction, rentalId))
    expect(returned).toMatchObject({ sealed: true })
    const report = await inShop(database, shop, (transaction) => comparisonReport(transaction, returned?.comparisonId ?? ''))
    expect(report).toMatchObject({ state: 'pending', simulated: true, modelAnswered: false, waitsForStart: true, findings: [] })
    expect(await queued(returned?.comparisonId ?? '')).toEqual([])
  })

  it('names each view by its photo plan’s label, not its key', async () => {
    const rentalId = await rentalOf('Marco Rossi')
    const [returned] = await inShop(database, shop, (transaction) => rentalReturns(transaction, rentalId))
    const report = await inShop(database, shop, (transaction) => comparisonReport(transaction, returned?.comparisonId ?? ''))
    expect(report?.viewLabels).toMatchObject({ 'frame-left': 'Frame left' })
  })

  it('is handed to the comparison worker once, and then no longer waits', async () => {
    const rentalId = await rentalOf('Marco Rossi')
    const started = await inShop(database, shop, (transaction) => startSampleComparison(transaction, rentalId, NOW))
    expect(started).toMatchObject({ ok: true, rentalId })
    if (!started.ok) throw new Error(started.reason)
    expect(await queued(started.comparisonId)).toHaveLength(1)
    expect(await inShop(database, shop, (transaction) => startSampleComparison(transaction, rentalId, NOW))).toEqual({ ok: false, reason: 'already_started' })
    expect(await queued(started.comparisonId)).toHaveLength(1)
    expect(await inShop(database, shop, (transaction) => comparisonReport(transaction, started.comparisonId))).toMatchObject({ waitsForStart: false })
  })

  it('refuses a real rental: only a sample is started by hand', async () => {
    const real = await readyRentalShop(database, 'sample-comparison-real', NOW)
    const rental = await real.readyRental()
    expect(await real.act((transaction) => startSampleComparison(transaction, rental.rentalId, NOW))).toEqual({ ok: false, reason: 'not_a_sample' })
  })

  it('refuses a sample rental with no comparison waiting, and any rental of another shop', async () => {
    const julia = await rentalOf('Julia Novak')
    expect(await inShop(database, shop, (transaction) => startSampleComparison(transaction, julia, NOW))).toEqual({ ok: false, reason: 'nothing_to_compare' })
    const other = await registerOwner(database, { subject: 'owner-sample-comparison-2', email: 'owner-sample-comparison-2@shop.example', name: 'Ana', language: 'en', shop: { name: 'Other Bikes', timeZone: 'Europe/Lisbon' } })
    const rentalId = await rentalOf('Marco Rossi')
    expect(await inShop(database, { role: 'hold_app', shopId: other.shopId }, (transaction) => startSampleComparison(transaction, rentalId, NOW))).toEqual({ ok: false, reason: 'not_found' })
  })
})
