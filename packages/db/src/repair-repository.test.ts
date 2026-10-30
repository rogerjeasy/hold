import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureSession, recordPhoto } from './capture-repository.ts'
import { approveClaim, draftClaim } from './claim-repository.ts'
import { fleetRecords } from './fleet-records.ts'
import { changeStatus } from './item-repository.ts'
import { claimRepairs, closeRepair, itemRepairs, repairGuides, openRepairFromMarks, openRepairs, openRepairsForClaim, repairCosts, startRepairCapture } from './repair-repository.ts'
import { claims, items, marks, paypalAccounts, repairLines, repairs, staffRoles, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { returnedWithFinding } from './testing/found-damage.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-03T10:00:00Z')
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
let owner: string
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

// A rental whose return comparison found damage, claimed on that finding and on a person's written line, then charged.
async function chargedClaim(at: ReadyRentalShop = shop) {
  const returned = await returnedWithFinding(at, NOW)
  const draft = await at.act((transaction) => draftClaim(transaction, returned.rentalId, at.scope.userId ?? '', [{ priceEntryId: returned.priceEntryId, findingId: returned.findingId }, { priceEntryId: returned.priceEntryId, reason: 'The bell is missing.' }], NOW))
  if (!draft.ok) throw new Error(draft.reason)
  await at.act((transaction) => approveClaim(transaction, draft.claimId, at.scope.userId ?? '', NOW))
  // PayPal's confirmed capture is the settle package's to test; here the claim is simply charged.
  await database.update(claims).set({ state: 'charged' }).where(eq(claims.id, draft.claimId))
  return { ...returned, claimId: draft.claimId }
}

async function photographed(sessionId: string, at: ReadyRentalShop = shop) {
  const session = await at.act((transaction) => captureSession(transaction, sessionId))
  for (const view of session?.plan ?? []) await at.act((transaction) => recordPhoto(transaction, sessionId, { view: view.key, evidenceKey: randomUUID(), sha256: 'b'.repeat(64), quality: { sharpness: 120, shadows: 20, highlights: 220, filled: .6 } }, later(20)))
  return session
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'repair', NOW)
  other = await readyRentalShop(database, 'repair-other', NOW)
  // The fixture's finding comes from the sample photographs, which only a sandbox shop may bill.
  await database.insert(paypalAccounts).values({ shopId: shop.scope.shopId, credentialReference: 'hold/paypal/repair', mode: 'sandbox' })
  owner = shop.scope.userId ?? ''
})
afterAll(async () => { await database.$client.close() })

describe('a charged claim', () => {
  it('puts its found damage on the item as a known mark, and opens one repair for the item with every line', async () => {
    const charged = await chargedClaim()
    const opened = await asWorker((transaction) => openRepairsForClaim(transaction, charged.claimId, NOW))
    expect(opened).toHaveLength(1)
    const [mark] = (await database.select().from(repairLines).innerJoin(marks, eq(marks.id, repairLines.markId)).where(eq(repairLines.repairId, opened[0] ?? ''))).map((row) => row.marks)
    expect(mark).toMatchObject({ description: 'A chip in the paint on the down tube.', region: { x: 0.3, y: 0.4, width: 0.1, height: 0.1 } })
    const repair = (await shop.act((transaction) => itemRepairs(transaction, charged.itemId))).find((each) => each.claimId === charged.claimId)
    expect(repair).toMatchObject({ state: 'open', claimId: charged.claimId, opener: null, lines: [expect.objectContaining({ markId: mark?.id, view: mark?.view, claimedCents: 35_00, outcome: null }), expect.objectContaining({ markId: null, view: null, description: 'The bell is missing.', claimedCents: 35_00 })] })
  })

  it('opens it once, however often the charge is confirmed', async () => {
    const charged = await chargedClaim()
    await asWorker((transaction) => openRepairsForClaim(transaction, charged.claimId, NOW))
    const marksOnItem = async () => (await database.select().from(marks).where(eq(marks.itemId, charged.itemId))).length
    const before = await marksOnItem()
    expect(await asWorker((transaction) => openRepairsForClaim(transaction, charged.claimId, NOW))).toEqual([])
    expect(await database.select().from(repairs).where(eq(repairs.claimId, charged.claimId))).toHaveLength(1)
    expect(await marksOnItem()).toBe(before)
  })
})

describe('photographing and closing a repair', () => {
  it('asks only for the views with marks, and closes the repaired mark with the photograph as evidence', async () => {
    // A shop of its own, so no other repair keeps the item out of service.
    const fresh = await readyRentalShop(database, 'repair-close', NOW)
    await database.insert(paypalAccounts).values({ shopId: fresh.scope.shopId, credentialReference: 'hold/paypal/repair-close', mode: 'sandbox' })
    const charged = await chargedClaim(fresh)
    const shop = fresh
    const owner = fresh.scope.userId ?? ''
    const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: fresh.scope.shopId }, work)
    await asWorker((transaction) => openRepairsForClaim(transaction, charged.claimId, NOW))
    const repair = (await shop.act((transaction) => itemRepairs(transaction, charged.itemId))).find((each) => each.claimId === charged.claimId)
    if (repair === undefined) throw new Error('No repair.')
    await shop.act((transaction) => changeStatus(transaction, charged.itemId, { to: 'in_repair', note: 'Paint' }, later(1)))
    const started = await shop.act((transaction) => startRepairCapture(transaction, repair.id, owner, later(2)))
    if (!started.ok || started.sessionId === null) throw new Error('No session.')
    expect(await shop.act((transaction) => startRepairCapture(transaction, repair.id, owner, later(3)))).toEqual(started)
    const session = await shop.act((transaction) => captureSession(transaction, started.sessionId))
    expect(session).toMatchObject({ kind: 'repair', rentalItemId: charged.rentalItemId })
    // Staff frame each view against the photograph the mark was found on.
    expect(await shop.act((transaction) => repairGuides(transaction, repair.id))).toEqual([expect.objectContaining({ view: repair.lines[0]?.view, markId: repair.lines[0]?.markId, region: { x: 0.3, y: 0.4, width: 0.1, height: 0.1 } })])
    expect(session?.plan.map((view) => [view.key, view.required])).toEqual([[repair.lines[0]?.view, true]])

    const outcomes = Object.fromEntries(repair.lines.map((line, index) => [line.id, index === 0 ? 'repaired' : 'left'] as const))
    expect(await shop.act((transaction) => closeRepair(transaction, { repairId: repair.id, userId: owner, outcomes, costCents: 62_00, note: '' }, later(4)))).toEqual({ ok: false, reason: 'views_missing' })
    await photographed(started.sessionId, fresh)
    expect(await shop.act((transaction) => closeRepair(transaction, { repairId: repair.id, userId: owner, outcomes: {}, costCents: 62_00, note: '' }, later(4)))).toEqual({ ok: false, reason: 'outcome_missing' })
    expect(await shop.act((transaction) => closeRepair(transaction, { repairId: repair.id, userId: owner, outcomes, costCents: 62_00, note: 'Touched up.' }, later(5)))).toMatchObject({ ok: true })

    const markId = repair.lines[0]?.markId ?? ''
    expect((await database.select().from(marks).where(eq(marks.id, markId)))[0]).toMatchObject({ status: 'repaired', repairId: repair.id, closedAt: later(5) })
    expect((await shop.act((transaction) => itemRepairs(transaction, charged.itemId))).find((each) => each.id === repair.id)).toMatchObject({ state: 'done', costCents: 62_00, note: 'Touched up.', closedAt: later(5), sessionSealed: true })
    expect((await database.select().from(items).where(eq(items.id, charged.itemId)))[0]?.status).toBe('in_service')
    // The renter who paid sees each line's repair, with its photograph, on their claim.
    const told = await shop.act((transaction) => claimRepairs(transaction, charged.rentalId))
    expect(told).toEqual(expect.arrayContaining([expect.objectContaining({ claimLineId: repair.lines[0]?.claimLineId, outcome: 'repaired', repairedAt: later(5), displayKey: null })]))
    expect(told.find((each) => each.claimLineId === repair.lines[1]?.claimLineId)).toMatchObject({ outcome: 'left' })
    await expect(database.update(repairs).set({ costCents: 1 }).where(eq(repairs.id, repair.id))).rejects.toThrow()
    expect(await shop.act((transaction) => closeRepair(transaction, { repairId: repair.id, userId: owner, outcomes, costCents: 1, note: '' }, later(6)))).toEqual({ ok: false, reason: 'already_done' })
  })

  it('needs no photograph when nothing on it has a mark', async () => {
    const returned = await returnedWithFinding(shop, NOW)
    const draft = await shop.act((transaction) => draftClaim(transaction, returned.rentalId, owner, [{ priceEntryId: returned.priceEntryId, reason: 'The bell is missing.' }], NOW))
    if (!draft.ok) throw new Error(draft.reason)
    await shop.act((transaction) => approveClaim(transaction, draft.claimId, owner, NOW))
    await database.update(claims).set({ state: 'charged' }).where(eq(claims.id, draft.claimId))
    await asWorker((transaction) => openRepairsForClaim(transaction, draft.claimId, NOW))
    const [repair] = (await shop.act((transaction) => itemRepairs(transaction, returned.itemId))).filter((each) => each.claimId === draft.claimId)
    if (repair === undefined) throw new Error('No repair.')
    expect(await shop.act((transaction) => startRepairCapture(transaction, repair.id, owner, NOW))).toEqual({ ok: true, sessionId: null })
    expect(await shop.act((transaction) => closeRepair(transaction, { repairId: repair.id, userId: owner, outcomes: { [repair.lines[0]?.id ?? '']: 'repaired' }, costCents: 4_50, note: '' }, later(1)))).toMatchObject({ ok: true })
  })
})

describe('a repair opened by hand', () => {
  it('covers open marks of one item not already in an open repair, for staff who may act', async () => {
    const charged = await chargedClaim()
    await asWorker((transaction) => openRepairsForClaim(transaction, charged.claimId, NOW))
    const [repair] = (await shop.act((transaction) => itemRepairs(transaction, charged.itemId))).filter((each) => each.claimId === charged.claimId)
    const markId = repair?.lines[0]?.markId ?? ''
    expect(await shop.act((transaction) => openRepairFromMarks(transaction, { itemId: charged.itemId, markIds: [markId], userId: owner }, NOW))).toEqual({ ok: false, reason: 'mark_in_repair' })
    // Left as is, the mark stays on the passport and may be repaired later.
    const started = await shop.act((transaction) => startRepairCapture(transaction, repair?.id ?? '', owner, NOW))
    await photographed(started.ok ? (started.sessionId ?? '') : '')
    await shop.act((transaction) => closeRepair(transaction, { repairId: repair?.id ?? '', userId: owner, outcomes: Object.fromEntries((repair?.lines ?? []).map((line) => [line.id, 'left'] as const)), costCents: 0, note: '' }, later(21)))
    expect((await database.select().from(marks).where(eq(marks.id, markId)))[0]?.status).toBe('open')

    const [person] = await database.insert(users).values({ cognitoSubject: 'repair-reader', email: 'reader@repair.example', name: 'Reader', language: 'en' }).returning()
    await database.insert(staffRoles).values({ shopId: shop.scope.shopId, userId: person?.id ?? '', role: 'read_only' })
    expect(await inShop(database, { role: 'hold_app', shopId: shop.scope.shopId, userId: person?.id ?? '' }, (transaction) => openRepairFromMarks(transaction, { itemId: charged.itemId, markIds: [markId], userId: person?.id ?? '' }, NOW))).toEqual({ ok: false, reason: 'role_may_not_confirm' })
    expect(await shop.act((transaction) => openRepairFromMarks(transaction, { itemId: charged.itemId, markIds: [], userId: owner }, NOW))).toEqual({ ok: false, reason: 'marks_needed' })
    expect(await shop.act((transaction) => openRepairFromMarks(transaction, { itemId: charged.itemId, markIds: [randomUUID()], userId: owner }, NOW))).toEqual({ ok: false, reason: 'not_found' })
    const opened = await shop.act((transaction) => openRepairFromMarks(transaction, { itemId: charged.itemId, markIds: [markId], userId: owner }, later(22)))
    expect(opened).toMatchObject({ ok: true })
    const manual = (await shop.act((transaction) => itemRepairs(transaction, charged.itemId))).find((each) => each.claimId === null && each.state === 'open')
    expect(manual).toMatchObject({ opener: 'Ana', lines: [expect.objectContaining({ markId, claimedCents: null })] })
  })
})

describe('what the shop reads', () => {
  it('lists open repairs, and what repairs cost by item and by price, to its own staff only', async () => {
    const waiting = await shop.act((transaction) => openRepairs(transaction))
    expect(waiting.length).toBeGreaterThan(0)
    expect(waiting[0]).toMatchObject({ itemLabel: expect.any(String) as unknown, claimedCents: expect.any(Number) as unknown })
    const costs = await shop.act((transaction) => repairCosts(transaction))
    expect(costs.byItem.some((row) => row.costCents >= 4_50)).toBe(true)
    // A repair is costed against a price only when every line it covers was priced from that one entry.
    expect(costs.byPrice).toEqual([expect.objectContaining({ priceEntryId: expect.any(String) as unknown, priceCents: 35_00, costsCents: expect.arrayContaining([4_50, 0]) as unknown })])
    const fleet = await shop.act((transaction) => fleetRecords(transaction))
    expect(fleet.some((record) => record.repairs.done > 0 && record.repairs.doneCostCents >= 4_50)).toBe(true)
    expect(fleet.some((record) => record.repairs.open > 0)).toBe(true)
    expect(await other.act((transaction) => openRepairs(transaction))).toEqual([])
    expect(await other.act((transaction) => repairCosts(transaction))).toEqual({ byItem: [], byPrice: [] })
  })
})
