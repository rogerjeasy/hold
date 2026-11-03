import { and, eq, isNull } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { openDemoSession } from './demo-session.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { claimLines, claims, mandates, rentals, renters, staffRoles } from './schema/index.ts'
import { inShop } from './scope.ts'
import { liveShopSettlement } from './settlement-mandate-repository.ts'
import { openSampleAdvocates } from './negotiation-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'

// A judge can watch the two advocates argue a contested claim without a real renter (extensions.md section 9): the
// demo shop starts with the owner's advocate limits set, and with a sample claim still waiting for the renter's reply.
const NOW = new Date('2026-12-01T09:00:00Z')
const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: TestDatabase
beforeAll(async () => {
  database = await createTestDatabase()
})

describe('a demo shop, for the advocates', () => {
  it('starts with the owner’s limits for the shop’s advocate, granted by the owner and live through the judging weeks', async () => {
    const opened = await openDemoSession(database, { owner: { subject: 'owner-adv1', email: 'tomas.adv1@demo.hold.example' }, staff: { subject: 'staff-adv1', email: 'jonas.adv1@demo.hold.example' }, slug: 'ribeira-bikes-adv1', paypal: PAYPAL, now: NOW })
    const mandate = await inShop(database, { role: 'hold_app', shopId: opened.shopId }, (transaction) => liveShopSettlement(transaction, NOW))
    expect(mandate?.limits).toMatchObject({ currency: 'EUR', lowestSharePercent: 50, rounds: 6, finalTap: true })
    expect(mandate?.validUntil.getTime()).toBeGreaterThan(NOW.getTime() + 21 * 86_400_000)
    const [row] = await database.select({ grantedBy: mandates.grantedByUserId }).from(mandates).where(eq(mandates.id, mandate?.id ?? ''))
    const [owner] = await database.select({ userId: staffRoles.userId }).from(staffRoles).where(and(eq(staffRoles.shopId, opened.shopId), eq(staffRoles.role, 'owner')))
    expect(row?.grantedBy).toBe(owner?.userId)
  })

  it('holds a sample claim of two lines that still waits for the renter’s reply, for a week', async () => {
    const opened = await openDemoSession(database, { owner: { subject: 'owner-adv2', email: 'tomas.adv2@demo.hold.example' }, staff: { subject: 'staff-adv2', email: 'jonas.adv2@demo.hold.example' }, slug: 'ribeira-bikes-adv2', paypal: PAYPAL, now: NOW })
    const waiting = await database.select({ claimId: claims.id, total: claims.totalCents, replyDueAt: claims.replyDueAt, simulated: rentals.simulated, renter: renters.name })
      .from(claims).innerJoin(rentals, eq(rentals.id, claims.rentalId)).innerJoin(renters, eq(renters.id, rentals.renterId))
      .where(and(eq(claims.shopId, opened.shopId), eq(claims.state, 'presented')))
    expect(waiting).toHaveLength(1)
    const [claim] = waiting
    expect(claim).toMatchObject({ total: 50_00, simulated: true })
    expect(claim?.replyDueAt?.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 6 * 86_400_000)
    const lines = await database.select({ cents: claimLines.amountCents, source: claimLines.source }).from(claimLines).where(eq(claimLines.claimId, claim?.claimId ?? ''))
    expect(lines.map((line) => [line.source, line.cents]).sort()).toEqual([['finding', 35_00], ['person', 15_00]])
  })

  it('grants no limits to a shop that only adds the sample rentals: only a demo shop is set up for its owner', async () => {
    const shop = await readyRentalShop(database, 'advocates-samples', NOW)
    expect(await shop.act((transaction) => addSampleRentals(transaction, { shopId: shop.scope.shopId, userId: shop.scope.userId ?? '', timeZone: 'Europe/Lisbon', now: NOW }))).toMatchObject({ ok: true })
    const live = await database.select({ id: mandates.id }).from(mandates).where(and(eq(mandates.shopId, shop.scope.shopId), eq(mandates.kind, 'settlement_shop'), isNull(mandates.revokedAt)))
    expect(live).toEqual([])
  })

  it('lets the advocates argue only a sample: never a real renter’s claim, and never one already answered', async () => {
    const opened = await openDemoSession(database, { owner: { subject: 'owner-adv3', email: 'tomas.adv3@demo.hold.example' }, staff: { subject: 'staff-adv3', email: 'jonas.adv3@demo.hold.example' }, slug: 'ribeira-bikes-adv3', paypal: PAYPAL, now: NOW })
    const scope = { role: 'hold_app' as const, shopId: opened.shopId }
    const [waiting] = await database.select({ rentalId: claims.rentalId }).from(claims).where(and(eq(claims.shopId, opened.shopId), eq(claims.state, 'presented')))
    const [answered] = await database.select({ rentalId: claims.rentalId }).from(claims).where(and(eq(claims.shopId, opened.shopId), eq(claims.state, 'contested')))
    const rentalId = waiting?.rentalId ?? ''
    expect(await inShop(database, scope, (transaction) => openSampleAdvocates(transaction, answered?.rentalId ?? '', { simulated: true }, NOW))).toMatchObject({ ok: false, reason: 'already_replied' })
    await database.update(rentals).set({ simulated: false }).where(eq(rentals.id, rentalId))
    expect(await inShop(database, scope, (transaction) => openSampleAdvocates(transaction, rentalId, { simulated: true }, NOW))).toEqual({ ok: false, reason: 'not_a_sample' })
    expect((await database.select({ state: claims.state }).from(claims).where(eq(claims.rentalId, rentalId)))[0]?.state).toBe('presented')
    await database.update(rentals).set({ simulated: true }).where(eq(rentals.id, rentalId))
    expect(await inShop(database, scope, (transaction) => openSampleAdvocates(transaction, rentalId, { simulated: true }, NOW))).toMatchObject({ ok: true, kind: 'negotiation' })
  })
})
