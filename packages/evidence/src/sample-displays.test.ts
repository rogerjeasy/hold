import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claims, openDemoSession, rentals, renters, reserveEvidencePack, SAMPLE_PHOTOS } from '@hold/db'
import { inShop } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import * as evidence from './index.ts'

// The sample rentals' photographs are the demonstration's own images, not copies in the display bucket (architecture.md
// section 20.3). The evidence worker reads them from files beside its code, so a sample rental's record can be built.
const SAMPLES = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'public', 'images')
const readSample = (file: string) => readFile(join(SAMPLES, file))
const NOW = new Date('2026-12-01T09:00:00Z')
let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })

describe('the sample photographs, for the evidence worker', () => {
  it('serves each reserved sample key from its file, and sends every other key to the store', async () => {
    const store = evidence.createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
    const wrapped = evidence.withSampleDisplays(store, readSample)
    expect(await wrapped.readDisplay(SAMPLE_PHOTOS.handover)).toEqual(await readSample('sample-handover.jpg'))
    expect(await wrapped.readDisplay('sample/not-a-sample.jpg')).toBeUndefined()
    expect(await wrapped.readDisplay('shop/session/view.jpg')).toBeUndefined()
  })

  it('lets a sample rental’s record be built from them', async () => {
    const opened = await openDemoSession(database, { owner: { subject: 'owner-sd', email: 'tomas.sd@demo.hold.example' }, staff: { subject: 'staff-sd', email: 'jonas.sd@demo.hold.example' }, slug: 'ribeira-bikes-sd', paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: NOW })
    const scope = { role: 'hold_app' as const, shopId: opened.shopId }
    const [priya] = await database.select({ id: rentals.id }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).innerJoin(claims, eq(claims.rentalId, rentals.id)).where(and(eq(rentals.shopId, opened.shopId), eq(renters.name, 'Priya Natarajan')))
    const pack = await inShop(database, scope, (transaction) => reserveEvidencePack(transaction, priya?.id ?? '', NOW))
    const store = evidence.createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
    const message = { shopId: opened.shopId, packId: pack?.id ?? '' }
    expect(await evidence.makeEvidencePack({ database, evidence: evidence.withSampleDisplays(store, readSample), documents: evidence.createMemoryDocumentStore() }, message)).toBe('made')
  })
})
