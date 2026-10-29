import { money } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { claimWorkspace } from './claim-query.ts'
import { comparisonReport } from './comparison-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { rentalReturns } from './return-repository.ts'
import { addSampleRentals, SAMPLE_PHOTOS } from './sample-rentals.ts'
import { dropOffsWaiting } from './self-return-repository.ts'
import { renters, rentals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// The sample claim a judge opens first shows its evidence: the handover and return photographs of the same view, the
// new mark outlined, and the comparison that found it (architecture.md section 20.3). Nothing about it is real.
const NOW = new Date('2026-10-14T09:12:00Z')
let database: TestDatabase
let shop: Scope & { readonly userId: string }

const rentalOf = async (renter: string) => {
  const [row] = await inShop(database, shop, (transaction) => transaction.select({ id: rentals.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, renter)))
  if (row === undefined) throw new Error(`No sample rental for ${renter}.`)
  return row.id
}

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner-evidence', email: 'owner-evidence@shop.example', name: 'Tomás', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shop = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  const entries = [
    { description: 'Scratch on the frame, through the paint', category: 'damage' as const, amount: money(35_00, 'EUR') },
    { description: 'Bent rear derailleur hanger', category: 'damage' as const, amount: money(25_00, 'EUR') },
    { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') },
  ]
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries, wearPolicy: 'Light scuffs are ordinary wear.' }, NOW))
  expect(await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: 'Europe/Lisbon', now: NOW }))).toMatchObject({ ok: true })
})

describe('the sample claim awaiting approval', () => {
  it('rests on a finding, shown on the handover and return photographs of the same view with the new mark outlined', async () => {
    const rentalId = await rentalOf('Priya Natarajan')
    const workspace = await inShop(database, shop, (transaction) => claimWorkspace(transaction, rentalId))
    const [line] = workspace?.lines ?? []
    expect(line).toMatchObject({ source: 'finding', description: 'Scratch on the frame, through the paint', amountCents: 35_00, beforeKey: SAMPLE_PHOTOS.handover, afterKey: SAMPLE_PHOTOS.damage })
    expect(line?.findingDescription).toMatch(/chip in the paint/)
    expect(line?.region?.width).toBeGreaterThan(0)
  })

  it('comes from a finished comparison, marked simulated, that found the new damage and set aside the mark recorded at handover', async () => {
    const rentalId = await rentalOf('Priya Natarajan')
    const [returned] = await inShop(database, shop, (transaction) => rentalReturns(transaction, rentalId))
    const report = await inShop(database, shop, (transaction) => comparisonReport(transaction, returned?.comparisonId ?? ''))
    expect(report).toMatchObject({ rentalId, state: 'findings', simulated: true })
    expect(report?.before.map((photo) => photo.displayKey)).toEqual([SAMPLE_PHOTOS.handover])
    expect(report?.after.map((photo) => photo.displayKey)).toEqual([SAMPLE_PHOTOS.damage])
    expect(report?.findings.map((finding) => [finding.class, finding.secondLookConfirmed])).toEqual(
      expect.arrayContaining([
        ['new_damage', true],
        ['known_mark', null],
      ]),
    )
    expect(report?.findings.find((finding) => finding.class === 'new_damage')).toMatchObject({ priceDescription: 'Scratch on the frame, through the paint', amountCents: 35_00 })
  })
})

describe('the sample return a renter dropped off overnight', () => {
  it('waits for a person, sent before its end, with the chip the comparison found and where the renter left it', async () => {
    const rentalId = await rentalOf('Chloé Martin')
    const [waiting] = (await inShop(database, shop, dropOffsWaiting)).filter((entry) => entry.rentalId === rentalId)
    expect(waiting).toMatchObject({ onTime: true, missingAt: null, simulated: true, holdCents: 300_00 })
    expect(waiting?.items).toEqual([expect.objectContaining({ views: 1, findings: 1, comparison: 'findings', before: { view: expect.stringMatching(/^frame/) as unknown, displayKey: SAMPLE_PHOTOS.handover }, after: expect.objectContaining({ displayKey: SAMPLE_PHOTOS.damage }) as unknown, dropPoint: { view: 'drop-point', displayKey: SAMPLE_PHOTOS.dropPoint } })])
    expect(waiting?.items[0]?.region?.width).toBeGreaterThan(0)
    // Sent at 21:40 on the shop's clock the evening before (Lisbon is UTC+1 on 13 October).
    expect(waiting?.droppedOffAt).toEqual(new Date('2026-10-13T20:40:00Z'))
  })
})

describe('the sample contested claim', () => {
  it('claims the loss the renter answers, so their words and the claim agree', async () => {
    const rentalId = await rentalOf('Tom Becker')
    const workspace = await inShop(database, shop, (transaction) => claimWorkspace(transaction, rentalId))
    expect(workspace?.lines.map((line) => line.description)).toEqual(['Lost lock'])
    expect(workspace?.replies.map((reply) => reply.comment)).toEqual(['The lock was in the bag when I handed it back.'])
  })
})
