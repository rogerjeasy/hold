import { money } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { decisionRecords } from './decision-records.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals, SAMPLE_PHOTOS } from './sample-rentals.ts'
import { claims, rentals, renters } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// What the decision board reads (extensions.md section 12.5): every record that waits on a person, in one place, read
// inside the shop alone. Each claim comes with its lines and the photographs behind them, read for all claims at once.

const NOW = new Date('2026-10-14T09:12:00Z')
const TIME_ZONE = 'Europe/Lisbon'
let database: TestDatabase
let shop: Scope & { readonly userId: string }
let other: Scope & { readonly userId: string }

async function owner(subject: string, name: string) {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: TIME_ZONE } })
  return { role: 'hold_app' as const, shopId: registered.shopId, userId: registered.userId }
}

const read = (scope: Scope) => inShop(database, scope, (transaction) => decisionRecords(transaction, NOW))

async function claimOf(renterName: string) {
  const [row] = await inShop(database, shop, (transaction) =>
    transaction.select({ id: claims.id }).from(claims).innerJoin(rentals, eq(rentals.id, claims.rentalId)).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(renters.name, renterName)))
  if (row === undefined) throw new Error(`No claim for ${renterName}.`)
  return row.id
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-decisions', 'Ribeira Bikes')
  other = await owner('owner-decisions-other', 'Douro Kayaks')
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
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: TIME_ZONE, now: NOW }))
})

describe('the records a decision board reads', () => {
  it('lists a claim waiting for approval with its lines, the finding’s region and both photographs', async () => {
    const { claims: waiting } = await read(shop)
    const priya = waiting.find((claim) => claim.renterName === 'Priya Natarajan')
    expect(priya).toMatchObject({ state: 'awaiting_approval', totalCents: 35_00, currency: 'EUR', simulated: true, renterComment: null })
    expect(priya?.reservedCents).toBeGreaterThan(0)
    expect(priya?.holdValidUntil).toBeInstanceOf(Date)
    expect(priya?.lines).toEqual([
      expect.objectContaining({ description: 'Deep scratch on the frame', amountCents: 35_00, source: 'finding', beforeKey: SAMPLE_PHOTOS.handover, afterKey: SAMPLE_PHOTOS.damage }),
    ])
    const region = priya?.lines[0]?.region
    expect([region?.x, region?.y, region?.width, region?.height].every((part) => typeof part === 'number' && part >= 0 && part <= 1)).toBe(true)
  })

  it('lists a contested claim with the renter’s latest words and a line a person wrote the reason for', async () => {
    const tom = (await read(shop)).claims.find((claim) => claim.renterName === 'Tom Becker')
    expect(tom).toMatchObject({ state: 'contested', renterComment: 'The lock was in the bag when I handed it back.' })
    expect(tom?.lines).toEqual([expect.objectContaining({ description: 'Lost lock', source: 'person', beforeKey: null, afterKey: null, region: null })])
    expect(tom?.lines[0]?.reason).not.toBeNull()
  })

  it('lists a claim the advocates escalated, and leaves out a claim already charged', async () => {
    const tomClaim = await claimOf('Tom Becker')
    await inShop(database, shop, (transaction) => transaction.update(claims).set({ state: 'escalated' }).where(eq(claims.id, tomClaim)))
    const { claims: waiting } = await read(shop)
    expect(waiting.find((claim) => claim.claimId === tomClaim)?.state).toBe('escalated')
    expect(waiting.map((claim) => claim.renterName)).not.toContain('Daniel Ortiz')
    await inShop(database, shop, (transaction) => transaction.update(claims).set({ state: 'contested' }).where(eq(claims.id, tomClaim)))
  })

  it('lists the held holds, the late rentals, the drop-offs, the waiting incidents, the sample proposals and how many staff the shop has', async () => {
    const records = await read(shop)
    expect(records.holds.map((hold) => hold.renterName)).toContain('Marco Rossi')
    expect(records.dropOffs.map((dropOff) => dropOff.renterName)).toEqual(['Chloé Martin'])
    expect(records.extensionPayments).toEqual([])
    expect(records.late.map((rental) => rental.renterName)).toEqual(['Lea Fischer'])
    expect(records.incidents).toEqual([])
    expect(records.proposals.map((entry) => entry.kind).sort()).toEqual(['request_replacement_hold', 'respond_to_dispute'])
    expect(records.staffCount).toBe(1)
  })

  it('reads nothing of another shop', async () => {
    expect(await read(other)).toEqual({ claims: [], proposals: [], incidents: [], holds: [], late: [], dropOffs: [], extensionPayments: [], repairs: [], staffCount: 1 })
  })
})
