import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { openDemoSession } from './demo-session.ts'
import { loadEvidenceBuild, reserveEvidencePack } from './evidence-repository.ts'
import { claims } from './schema/index.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'

// The worker builds a pack only when the snapshot it reads back has the fingerprint taken when the pack was reserved
// (packages/evidence pack-job.ts). Every rental's snapshot must survive that round trip, samples included.
const NOW = new Date('2026-12-01T09:00:00Z')
let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })

const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('a rental’s evidence pack', () => {
  it('reads back with the fingerprint it was reserved with, for every rental of a demo shop', async () => {
    const opened = await openDemoSession(database, { owner: { subject: 'owner-fp', email: 'tomas.fp@demo.hold.example' }, staff: { subject: 'staff-fp', email: 'jonas.fp@demo.hold.example' }, slug: 'ribeira-bikes-fp', paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' }, now: NOW })
    const scope = { role: 'hold_app' as const, shopId: opened.shopId }
    const withClaims = await database.select({ rentalId: claims.rentalId }).from(claims).where(eq(claims.shopId, opened.shopId))
    expect(withClaims.length).toBeGreaterThan(0)
    for (const { rentalId } of withClaims) {
      const pack = await inShop(database, scope, (transaction) => reserveEvidencePack(transaction, rentalId, NOW))
      expect(pack).toBeDefined()
      const loaded = await inShop(database, { role: 'hold_worker', shopId: opened.shopId }, (transaction) => loadEvidenceBuild(transaction, pack?.id ?? ''))
      expect({ rentalId, fingerprint: sha256(loaded?.snapshot) }).toEqual({ rentalId, fingerprint: pack?.sourceFingerprint })
    }
  })

  it('reads back with the fingerprint it was reserved with, for a real rental', async () => {
    const shop = await readyRentalShop(database, 'evidence-fingerprint', NOW)
    const rental = await shop.readyRental()
    const pack = await shop.act((transaction) => reserveEvidencePack(transaction, rental.rentalId, NOW))
    expect(pack).toBeDefined()
    const loaded = await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => loadEvidenceBuild(transaction, pack?.id ?? ''))
    expect(sha256(loaded?.snapshot)).toBe(pack?.sourceFingerprint)
  })
})
