import { createHash, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { recordPhoto, sealSession, startCaptureSession } from './capture-repository.ts'
import { approveClaim, draftClaim, presentClaim } from './claim-repository.ts'
import { claimWorkspace } from './claim-query.ts'
import { replyToClaim } from './claim-reply-repository.ts'
import { beginComparison } from './comparison-repository.ts'
import { agreeIncident, confirmIncidentPrice, makeShopMatter, sendIncident, sortIncidentReport, startIncident } from './incident-repository.ts'
import type { TriageAnswer } from './incident-repository.ts'
import { closeRentalIncidents } from './incident-closing.ts'
import { claimLines, comparisons, executions, incidents, marks, priceEntries } from './schema/index.ts'
import { createTestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

// The incident desk at the return (extensions.md section 10.4, X5.2 to X5.4, X5.6): an agreed line reaches the claim,
// staff may lower or remove it and never raise it, and the one final capture is the confirmed lines.

const NOW = new Date('2026-10-21T09:00:00Z')
const QUALITY = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const answer = (kind: 'small_damage' | 'mechanical_fault', priceCode: string | null): TriageAnswer => ({ outcome: 'answered', data: { kind, confidence: 0.95, priceCode, confirmation: null }, model: 'anthropic.claude-opus-5-5', promptVersion: 'incident-1', simulated: false })
const BOX = { view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } }

let shop: ReadyRentalShop
let owner: string
let priceId: string

async function session(rentalId: string, rentalItemId: string, kind: 'handover' | 'return') {
  const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId, rentalItemId, kind, actorUserId: owner }, NOW))
  if (!started.ok) throw new Error(started.reason)
  for (const view of ['left-side', 'right-side']) await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: randomUUID(), sha256: sha(`${started.sessionId}-${view}`), quality: QUALITY }, NOW))
  await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  return started.sessionId
}

// A rental out, with a report of the given hint sent, sorted and, for damage, priced by staff and agreed by the renter.
async function withIncident(hint: 'damage' | 'fault') {
  const rental = await shop.readyRental()
  const rentalItemId = rental.rentalItemIds[0] ?? ''
  await session(rental.rentalId, rentalItemId, 'handover')
  const started = await shop.act((transaction) => startIncident(transaction, { rentalId: rental.rentalId, itemId: rental.itemIds[0] ?? '', hint, description: hint === 'damage' ? 'A scratch on the left side' : 'The battery will not charge', language: 'en' }, NOW))
  if (!started.ok) throw new Error(started.reason)
  await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'left-side', evidenceKey: randomUUID(), sha256: sha(`incident-${started.incidentId}`), quality: QUALITY }, NOW))
  await shop.act((transaction) => sendIncident(transaction, rental.rentalId, started.incidentId, BOX, NOW))
  if (hint === 'damage') {
    await shop.act((transaction) => sortIncidentReport(transaction, started.incidentId, answer('small_damage', 'scratch'), NOW))
    await shop.act((transaction) => confirmIncidentPrice(transaction, started.incidentId, owner, priceId, NOW))
    const agreed = await shop.act((transaction) => agreeIncident(transaction, rental.rentalId, started.incidentId, NOW))
    if (!agreed.ok) throw new Error(agreed.reason)
  } else {
    await shop.act((transaction) => sortIncidentReport(transaction, started.incidentId, answer('mechanical_fault', null), NOW))
    await shop.act((transaction) => makeShopMatter(transaction, started.incidentId))
  }
  return { rentalId: rental.rentalId, rentalItemId, incidentId: started.incidentId }
}

async function returned(rental: { readonly rentalId: string; readonly rentalItemId: string }) {
  return session(rental.rentalId, rental.rentalItemId, 'return')
}

beforeAll(async () => {
  const database = await createTestDatabase()
  shop = await readyRentalShop(database, 'incident-claim', NOW)
  owner = shop.scope.userId ?? ''
  priceId = (await shop.act((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
})

describe('the comparison at the return (X5.2)', () => {
  it('reads marks reported during this rental, covered when agreed or the shop’s matter, never as known marks', async () => {
    const agreed = await withIncident('damage')
    const returnSession = await returned(agreed)
    const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.returnSessionId, returnSession)))
    const work = await shop.act((transaction) => beginComparison(transaction, comparison?.id ?? '', NOW))
    const [mark] = await shop.act((transaction) => transaction.select().from(marks).where(eq(marks.incidentId, agreed.incidentId)))
    expect(work?.reported).toEqual([{ id: mark?.id, view: 'left-side', region: BOX.region, covered: true }])
    expect(work?.known.some((known) => known.id === mark?.id)).toBe(false)
  })

  it('treats the item’s incident photographs as earlier evidence, so a return reusing one is caught', async () => {
    const fault = await withIncident('fault')
    const returnSession = await returned(fault)
    const [comparison] = await shop.act((transaction) => transaction.select().from(comparisons).where(eq(comparisons.returnSessionId, returnSession)))
    const work = await shop.act((transaction) => beginComparison(transaction, comparison?.id ?? '', NOW))
    expect(work?.previous.some((photo) => photo.sha256 === sha(`incident-${fault.incidentId}`))).toBe(true)
    expect(work?.reported).toMatchObject([{ covered: true }])
  })
})

describe('the claim draft (X5.3)', () => {
  it('carries the agreed line, which staff may keep or lower', async () => {
    const rental = await withIncident('damage')
    await returned(rental)
    const lowered = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ incidentId: rental.incidentId, amountCents: 20_00 }], NOW))
    expect(lowered).toMatchObject({ ok: true, totalCents: 20_00 })
    const lines = await shop.act((transaction) => transaction.select().from(claimLines).where(eq(claimLines.incidentId, rental.incidentId)))
    expect(lines).toMatchObject([{ source: 'agreed_in_rental', amountCents: 20_00, priceEntryId: priceId, findingId: null }])
    expect(await shop.act((transaction) => claimWorkspace(transaction, rental.rentalId))).toMatchObject({ lines: [{ source: 'agreed_in_rental', incidentId: rental.incidentId, amountCents: 20_00, incidentDescription: 'A scratch on the left side' }] })
  })

  it('never raises the agreed line, and never takes a line from a report that was not agreed (X5.6)', async () => {
    const rental = await withIncident('damage')
    await returned(rental)
    expect(await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ incidentId: rental.incidentId, amountCents: 35_01 }], NOW))).toEqual({ ok: false, reason: 'raises_agreed_line' })
    expect(await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ incidentId: rental.incidentId, amountCents: 0 }], NOW))).toEqual({ ok: false, reason: 'empty_line' })
    const fault = await withIncident('fault')
    await returned(fault)
    expect(await shop.act((transaction) => draftClaim(transaction, fault.rentalId, owner, [{ incidentId: fault.incidentId, amountCents: 10_00 }], NOW))).toEqual({ ok: false, reason: 'incident_not_agreed' })
    expect(await shop.act((transaction) => draftClaim(transaction, fault.rentalId, owner, [{ incidentId: rental.incidentId, amountCents: 10_00 }], NOW))).toEqual({ ok: false, reason: 'incident_not_agreed' })
    expect((await shop.act((transaction) => claimWorkspace(transaction, rental.rentalId)))?.agreedIncidents).toMatchObject([{ id: rental.incidentId, agreedCents: 35_00, priceDescription: 'Scratch' }])
  })

  it('may leave the agreed line out: a claim of other lines alone', async () => {
    const rental = await withIncident('damage')
    await returned(rental)
    expect(await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ priceEntryId: priceId, reason: 'Mud in the motor, inspected in person.' }], NOW))).toMatchObject({ ok: true, totalCents: 35_00 })
    expect(await shop.act((transaction) => transaction.select().from(claimLines).where(eq(claimLines.incidentId, rental.incidentId)))).toEqual([])
  })
})

describe('settling (X5.4)', () => {
  it('captures exactly the confirmed lines, once, and releases the rest of the hold', async () => {
    const rental = await withIncident('damage')
    await returned(rental)
    const drafted = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ incidentId: rental.incidentId, amountCents: 25_00 }], NOW))
    if (!drafted.ok) throw new Error(drafted.reason)
    await shop.act((transaction) => approveClaim(transaction, drafted.claimId, owner, NOW))
    await shop.act((transaction) => presentClaim(transaction, drafted.claimId, owner, NOW))
    const accepted = await shop.act((transaction) => replyToClaim(transaction, rental.rentalId, 'accept', '', NOW))
    expect(accepted).toMatchObject({ ok: true })
    const captures = (await shop.act((transaction) => transaction.select().from(executions).where(eq(executions.rentalId, rental.rentalId)))).filter((row) => row.action === 'capture')
    expect(captures).toMatchObject([{ amountCents: 25_00, currency: 'EUR' }])
    expect(await shop.act((transaction) => claimWorkspace(transaction, rental.rentalId))).toMatchObject({ amounts: { capture: { cents: 25_00 }, release: { cents: 300_00 - 25_00 }, invoice: { cents: 0 } } })
  })
})

describe('incidents through the return and the close', () => {
  it('moves an offer nobody agreed to a person at the return, and a waiting report into the claim', async () => {
    const rental = await shop.readyRental()
    const rentalItemId = rental.rentalItemIds[0] ?? ''
    await session(rental.rentalId, rentalItemId, 'handover')
    const started = await shop.act((transaction) => startIncident(transaction, { rentalId: rental.rentalId, itemId: rental.itemIds[0] ?? '', hint: 'damage', description: 'A dent in the mudguard', language: 'en' }, NOW))
    if (!started.ok) throw new Error(started.reason)
    await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view: 'left-side', evidenceKey: randomUUID(), sha256: sha(`dent-${started.incidentId}`), quality: QUALITY }, NOW))
    await shop.act((transaction) => sendIncident(transaction, rental.rentalId, started.incidentId, BOX, NOW))
    await shop.act((transaction) => sortIncidentReport(transaction, started.incidentId, answer('small_damage', 'scratch'), NOW))
    await returned({ rentalId: rental.rentalId, rentalItemId })
    const state = async () => (await shop.act((transaction) => transaction.select({ state: incidents.state }).from(incidents).where(eq(incidents.id, started.incidentId))))[0]?.state
    expect(await state()).toBe('awaiting_staff')
    await shop.act((transaction) => draftClaim(transaction, rental.rentalId, owner, [{ priceEntryId: priceId, reason: 'The dent the renter reported, seen in person.' }], NOW))
    expect(await state()).toBe('claim_opened')
  })

  it('resolves the rental’s incidents when it closes, and their marks join the item’s history', async () => {
    const rental = await withIncident('damage')
    await shop.act((transaction) => closeRentalIncidents(transaction, rental.rentalId, NOW))
    expect(await shop.act((transaction) => transaction.select({ state: incidents.state, resolvedAt: incidents.resolvedAt }).from(incidents).where(eq(incidents.id, rental.incidentId)))).toEqual([{ state: 'resolved', resolvedAt: NOW }])
    expect(await shop.act((transaction) => transaction.select({ status: marks.status }).from(marks).where(eq(marks.incidentId, rental.incidentId)))).toEqual([{ status: 'open' }])
  })
})
