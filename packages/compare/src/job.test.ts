import { createHash } from 'node:crypto'
import { beginComparison, captureSession, comparisonReport, comparisons, completeComparison, findings, holds, inShop, recordPhoto, rentals, sealSession, startCaptureSession } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import { createMemoryEvidenceStore } from '@hold/evidence'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { runComparison } from './job.ts'

const NOW = new Date('2026-10-20T09:00:00Z')
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex')
const quality = { sharpness: 120, shadows: 20, highlights: 220, filled: 0.6 }

async function queued(before: Buffer, after: Buffer, subject: string, samples = false) {
  const database = await createTestDatabase()
  const shop = await readyRentalShop(database, subject, NOW)
  const rental = await shop.readyRental()
  const evidence = createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
  for (const kind of ['handover', 'return'] as const) {
    const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: null }, NOW))
    if (!started.ok) throw new Error(started.reason)
    const body = kind === 'handover' ? before : after
    for (const view of ['left-side', 'right-side']) {
      const key = `${shop.scope.shopId}/${started.sessionId}/${view}.jpg`
      const link = await evidence.uploadLink({ key, sha256: sha(body), bytes: body.length })
      evidence.receive(key, body, link.headers['x-amz-checksum-sha256'] ?? '')
      await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: key, sha256: sha(body), quality, simulated: samples }, NOW))
    }
    await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
  }
  const [comparison] = await database.select().from(comparisons)
  if (comparison === undefined) throw new Error('No comparison')
  return { database, shop, rental, evidence, comparison }
}

// A picture with enough texture for code to align a pair.
async function textured() {
  const pixels = Buffer.alloc(640 * 480 * 3, 140)
  for (let y = 70; y < 410; y += 1) for (let x = 90; x < 550; x += 1) for (let c = 0; c < 3; c += 1) pixels[(y * 640 + x) * 3 + c] = ((x * 13 + y * 7 + ((x >> 4) * (y >> 4))) % 180) + 30
  return sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } }).jpeg().toBuffer()
}

describe('comparison queue processing', () => {
  it('stores independently checked findings and the agreed price entry, never a model amount', async () => {
    const before = await textured()
    const fixture = await queued(before, await sharp(before).linear(1, 3).jpeg().toBuffer(), 'comparison-findings')
    const model = { look: () => Promise.resolve({ kind: 'result' as const, model: 'recorded-model', inputTokens: 100, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [{ region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, class: 'new_damage', confidence: 0.96, description: 'New scratch', priceCode: 'scratch' }], dismissed: [] } }) }
    const message = { shopId: fixture.shop.scope.shopId, comparisonId: fixture.comparison.id }
    expect(await runComparison({ ...fixture, role: 'hold_worker', model, now: () => NOW }, message)).toBe('completed')
    const report = await fixture.shop.act((transaction) => comparisonReport(transaction, fixture.comparison.id))
    expect(report).toMatchObject({ state: 'findings', model: 'recorded-model', findings: [{ class: 'new_damage', secondLookConfirmed: true, amountCents: 3500 }, { class: 'new_damage', secondLookConfirmed: true, amountCents: 3500 }] })
    expect(report?.after[0]).not.toHaveProperty('evidenceKey')
  })

  it('recovers an expired worker lease and refuses its stale completion', async () => {
    const body = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'grey' } }).jpeg().toBuffer()
    const { shop, comparison } = await queued(body, body, 'comparison-lease')
    expect(await shop.act((transaction) => beginComparison(transaction, comparison.id, NOW))).toBeDefined()
    expect(await shop.act((transaction) => beginComparison(transaction, comparison.id, new Date(NOW.getTime() + 60_000)))).toBeUndefined()
    const resumed = new Date(NOW.getTime() + 180_001)
    expect(await shop.act((transaction) => beginComparison(transaction, comparison.id, resumed))).toBeDefined()
    const result = { state: 'clean' as const, model: 'recorded-model', promptVersion: 'inspection-1', alignment: {}, findings: [], simulated: false, reason: null }
    expect(await shop.act((transaction) => completeComparison(transaction, comparison.id, NOW, result, resumed))).toBe(false)
    expect(await shop.act((transaction) => completeComparison(transaction, comparison.id, resumed, result, resumed))).toBe(true)
  })
  // The demonstration's samples are one file each, so a return photographed from the handover sample repeats it byte for
  // byte. A sample claims to show nothing about this return, so it is compared, and the comparison says it is simulated.
  it('compares sample return photographs instead of deferring them as reused, and marks the comparison simulated', async () => {
    const body = await textured()
    const fixture = await queued(body, body, 'comparison-samples', true)
    const model = { look: () => Promise.resolve({ kind: 'result' as const, model: 'recorded-model', inputTokens: 100, outputTokens: 50, data: { sameItem: true, sameView: true, findings: [], dismissed: [] } }) }
    expect(await runComparison({ ...fixture, role: 'hold_worker', model, now: () => NOW }, { shopId: fixture.shop.scope.shopId, comparisonId: fixture.comparison.id })).toBe('completed')
    expect((await fixture.database.select().from(comparisons))[0]).toMatchObject({ state: 'clean', model: 'recorded-model', simulated: true, deferredReason: null })
  })

  it('persists a deferred result for reused photographs once, without calling a model or changing the hold', async () => {
    const database = await createTestDatabase()
    const shop = await readyRentalShop(database, 'comparison-job', NOW)
    const rental = await shop.readyRental()
    const evidence = createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
    const body = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'grey' } }).jpeg().toBuffer()
    for (const kind of ['handover', 'return'] as const) {
      const started = await shop.act((transaction) => startCaptureSession(transaction, { rentalId: rental.rentalId, rentalItemId: rental.rentalItemIds[0] ?? '', kind, actorUserId: null }, NOW))
      if (!started.ok) throw new Error(started.reason)
      for (const view of ['left-side', 'right-side']) {
        const key = `${shop.scope.shopId}/${started.sessionId}/${view}.jpg`
        const link = await evidence.uploadLink({ key, sha256: sha(body), bytes: body.length })
        evidence.receive(key, body, link.headers['x-amz-checksum-sha256'] ?? '')
        await shop.act((transaction) => recordPhoto(transaction, started.sessionId, { view, evidenceKey: key, sha256: sha(body), quality }, NOW))
      }
      await shop.act((transaction) => sealSession(transaction, started.sessionId, NOW))
      expect((await shop.act((transaction) => captureSession(transaction, started.sessionId)))?.sealedAt).toEqual(NOW)
    }
    const [comparison] = await database.select().from(comparisons)
    if (comparison === undefined) throw new Error('No queued comparison')
    const dependencies = { database, role: 'hold_worker' as const, evidence, model: { look: () => { throw new Error('Reused evidence must not reach a model') } }, now: () => NOW }
    const message = { shopId: shop.scope.shopId, comparisonId: comparison.id }
    expect(await runComparison(dependencies, message)).toBe('completed')
    expect(await runComparison(dependencies, message)).toBe('nothing_to_do')
    expect((await database.select().from(comparisons))[0]).toMatchObject({ state: 'deferred', promptVersion: 'inspection-3', model: 'not_called', completedAt: NOW })
    expect((await database.select().from(rentals))[0]?.state).toBe('inspecting')
    expect((await database.select().from(holds))[0]?.state).toBe('placed')
    expect(await database.select().from(findings)).toEqual([])
    expect(await inShop(database, { role: 'hold_worker', shopId: '00000000-0000-0000-0000-000000000001' }, (transaction) => transaction.select().from(comparisons))).toEqual([])
  })
})
