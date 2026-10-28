import { money } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { decideProposal, morningQueue } from './ops-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { outbox, proposals } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// The operations agent reads no sample rental, so a shop with samples shows its morning queue through two sample
// proposals of its own: a replacement hold for the hold near its end, and an answer to a sample PayPal dispute. Each is
// marked as a sample, and approving one records the decision and moves nothing, at PayPal or anywhere else.

const NOW = new Date('2026-10-14T09:12:00Z')
let database: TestDatabase
let shop: Scope & { readonly userId: string }

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, { subject: 'owner-sample-proposals', email: 'owner-sample-proposals@shop.example', name: 'Ribeira Bikes', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  shop = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }
  const entries = [
    { description: 'Deep scratch on the frame', category: 'damage' as const, amount: money(35_00, 'EUR') },
    { description: 'Lost lock', category: 'loss' as const, amount: money(45_00, 'EUR') },
  ]
  await inShop(database, shop, (transaction) => publishPriceList(transaction, shop.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries, wearPolicy: 'Light scuffs are ordinary wear.' }, NOW))
  await inShop(database, shop, (transaction) => addSampleRentals(transaction, { shopId: shop.shopId, userId: shop.userId, timeZone: 'Europe/Lisbon', now: NOW }))
})

const queue = () => inShop(database, shop, (transaction) => morningQueue(transaction, NOW))

describe('sample proposals', () => {
  it('fill the morning queue with a replacement hold and a dispute answer, each with its detector’s reason, marked as samples', async () => {
    const entries = await queue()
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['request_replacement_hold', 'respond_to_dispute'])
    const replacement = entries.find((entry) => entry.kind === 'request_replacement_hold')
    expect(replacement).toMatchObject({ subjectKind: 'hold', amountCents: expect.any(Number) as number, payload: { fixedReason: 'hold_ending', simulated: 'yes' } })
    expect(replacement?.deadline).toBeInstanceOf(Date)
    const dispute = entries.find((entry) => entry.kind === 'respond_to_dispute')
    expect(dispute).toMatchObject({ subjectKind: 'dispute', payload: { fixedReason: 'dispute_open', simulated: 'yes' } })
    expect(dispute?.draft).not.toBeNull()
    expect(dispute?.references.every((reference) => reference.startsWith('SIMULATED-'))).toBe(true)
  })

  it('when approved, are recorded as carried out and send nothing to PayPal or the renter', async () => {
    const before = await inShop(database, shop, (transaction) => transaction.select().from(outbox))
    for (const entry of await queue()) {
      const decided = await inShop(database, shop, (transaction) => decideProposal(transaction, entry.id, shop.userId, { decision: 'approve', reason: '' }, NOW))
      expect(decided).toMatchObject({ ok: true, state: 'executed' })
    }
    const after = await inShop(database, shop, (transaction) => transaction.select().from(outbox))
    expect(after).toHaveLength(before.length)
    const executed = await inShop(database, shop, (transaction) => transaction.select().from(proposals).where(and(eq(proposals.state, 'executed'), eq(proposals.shopId, shop.shopId))))
    expect(executed).toHaveLength(2)
    expect(await queue()).toEqual([])
  })
})
