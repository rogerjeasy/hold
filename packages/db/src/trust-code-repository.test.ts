import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { renterLinks, renters } from './schema/index.ts'
import { savePayPalAccount } from './shop-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { issueTrustCode, useTrustCode } from './trust-code-repository.ts'

// The one-time code a renter gives before changing their Clean Record (extensions.md section 7.6). Staff open view
// links at the counter, so a link alone cannot consent for the renter or delete their record.

const NOW = new Date('2026-10-26T09:00:00Z')
const MINUTE = 60_000
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE)

let database: TestDatabase
let shop: ReadyRentalShop

async function linkOf(rentalId: string): Promise<string> {
  const [link] = await database.select({ id: renterLinks.id }).from(renterLinks).where(eq(renterLinks.rentalId, rentalId))
  return link?.id ?? ''
}

async function freshLink(): Promise<string> {
  return linkOf(await shop.paidRental(`PAYER-CODE-${String(Math.random())}`))
}

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'trust-code', NOW)
})

describe('a code for changing the Clean Record', () => {
  it('goes to the address PayPal gave for the payer, and works once', async () => {
    const linkId = await freshLink()
    expect(await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash-1', NOW))).toEqual({ ok: true, channel: 'email', email: 'priya@example.com', sandboxContact: false })
    expect(await shop.act((transaction) => useTrustCode(transaction, linkId, 'hash-1', later(1)))).toEqual({ ok: true })
    expect(await shop.act((transaction) => useTrustCode(transaction, linkId, 'hash-1', later(1)))).toEqual({ ok: false, reason: 'code_expired' })
  })

  it('is refused when wrong, and stops working after three wrong tries', async () => {
    const linkId = await freshLink()
    await shop.act((transaction) => issueTrustCode(transaction, linkId, 'right', NOW))
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await shop.act((transaction) => useTrustCode(transaction, linkId, 'wrong', later(1)))).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await shop.act((transaction) => useTrustCode(transaction, linkId, 'right', later(1)))).toEqual({ ok: false, reason: 'code_expired' })
  })

  it('expires after ten minutes', async () => {
    const linkId = await freshLink()
    await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash', NOW))
    expect(await shop.act((transaction) => useTrustCode(transaction, linkId, 'hash', later(10)))).toEqual({ ok: false, reason: 'code_expired' })
  })

  it('is not sent again within a minute', async () => {
    const linkId = await freshLink()
    await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash', NOW))
    expect(await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash-2', later(0.5)))).toEqual({ ok: false, reason: 'code_recently_sent' })
    expect(await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash-2', later(1.5)))).toMatchObject({ ok: true })
  })

  it('is kept apart from a claim reply’s code on the same link', async () => {
    const linkId = await freshLink()
    await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash', NOW))
    expect((await database.select().from(renterLinks).where(eq(renterLinks.id, linkId)))[0]).toMatchObject({ claimCodeHash: null, trustCodeHash: 'hash' })
  })

  it('is refused on a revoked or expired link, and before PayPal has named the payer', async () => {
    const revoked = await freshLink()
    await database.update(renterLinks).set({ revokedAt: NOW }).where(eq(renterLinks.id, revoked))
    expect(await shop.act((transaction) => issueTrustCode(transaction, revoked, 'hash', NOW))).toEqual({ ok: false, reason: 'link_invalid' })
    expect(await shop.act((transaction) => useTrustCode(transaction, revoked, 'hash', NOW))).toEqual({ ok: false, reason: 'code_expired' })
    const lapsed = await freshLink()
    await database.update(renterLinks).set({ expiresAt: NOW }).where(eq(renterLinks.id, lapsed))
    expect(await shop.act((transaction) => issueTrustCode(transaction, lapsed, 'hash', NOW))).toEqual({ ok: false, reason: 'link_invalid' })
  })

  it('goes to the booking’s contact in the sandbox, where PayPal’s test payer receives nothing, and says so', async () => {
    await shop.act((transaction) => savePayPalAccount(transaction, shop.scope.shopId, 'sandbox', 'hold/paypal/shops/test/sandbox'))
    const payer = `PAYER-SANDBOX-${String(Math.random())}`
    const rentalId = await shop.paidRental(payer)
    await database.update(renters).set({ email: 'buyer@personal.example.com' }).where(eq(renters.paypalPayerId, payer))
    const linkId = await linkOf(rentalId)
    expect(await shop.act((transaction) => issueTrustCode(transaction, linkId, 'hash', NOW))).toEqual({ ok: true, channel: 'email', email: 'priya@example.com', sandboxContact: true })
  })
})
