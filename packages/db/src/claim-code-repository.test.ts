import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { issueClaimCode, useClaimCode } from './claim-code-repository.ts'
import { approveClaim, draftClaim, presentClaim } from './claim-repository.ts'
import { paypalAccounts, renterLinks, renters, rentals, priceEntries } from './schema/index.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
const NOW = new Date('2026-10-20T09:00:00Z')
let database: Awaited<ReturnType<typeof createTestDatabase>>
let shop: Awaited<ReturnType<typeof readyRentalShop>>
async function link() {
  const rental = await shop.readyRental()
  await database.update(rentals).set({ state: 'inspecting' }).where(eq(rentals.id, rental.rentalId))
  const entry = (await shop.act((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
  const claim = await shop.act((transaction) => draftClaim(transaction, rental.rentalId, shop.scope.userId ?? '', [{ priceEntryId: entry, reason: 'Inspected damage.' }], NOW))
  if (!claim.ok) throw new Error(claim.reason)
  await shop.act((transaction) => approveClaim(transaction, claim.claimId, shop.scope.userId ?? '', NOW))
  await shop.act((transaction) => presentClaim(transaction, claim.claimId, shop.scope.userId ?? '', NOW))
  const [created] = await database.insert(renterLinks).values({ shopId: shop.scope.shopId, rentalId: rental.rentalId, tokenFingerprint: rental.rentalId, scopes: ['view', 'accept', 'contest'], expiresAt: new Date('2027-01-01') }).returning()
  if (created === undefined) throw new Error('No link')
  return created
}
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'claim-code', NOW) })
describe('claim reply codes', () => {
  it('binds a code to one live claim link and consumes it only once', async () => {
    const first = await link(); const second = await link()
    expect(await shop.act((transaction) => issueClaimCode(transaction, first.id, 'hash-first', NOW))).toMatchObject({ ok: true, email: 'priya@example.com' })
    expect(await shop.act((transaction) => useClaimCode(transaction, second.id, 'hash-first', NOW))).toEqual({ ok: false, reason: 'code_expired' })
    expect(await shop.act((transaction) => useClaimCode(transaction, first.id, 'hash-first', NOW))).toEqual({ ok: true })
    expect(await shop.act((transaction) => useClaimCode(transaction, first.id, 'hash-first', NOW))).toEqual({ ok: false, reason: 'code_expired' })
  })
  it('expires after ten minutes and locks after three wrong attempts', async () => {
    const first = await link()
    await shop.act((transaction) => issueClaimCode(transaction, first.id, 'correct', NOW))
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await shop.act((transaction) => useClaimCode(transaction, first.id, 'wrong', NOW))).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await shop.act((transaction) => useClaimCode(transaction, first.id, 'correct', NOW))).toEqual({ ok: false, reason: 'code_expired' })
    const second = await link()
    await shop.act((transaction) => issueClaimCode(transaction, second.id, 'expires', NOW))
    expect(await shop.act((transaction) => useClaimCode(transaction, second.id, 'expires', new Date(NOW.getTime() + 600000)))).toEqual({ ok: false, reason: 'code_expired' })
  })
  it('sends the code to the booking contact when a sandbox payer is a PayPal test account, and says so', async () => {
    const first = await link()
    const [rental] = await database.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, first.rentalId))
    await database.update(rentals).set({ contactEmail: 'priya.contact@example.org' }).where(eq(rentals.id, first.rentalId))
    await database.update(renters).set({ email: 'sb-test42@personal.example.com' }).where(eq(renters.id, rental?.renterId ?? ''))
    await database.insert(paypalAccounts).values({ shopId: shop.scope.shopId, credentialReference: 'hold/paypal/shops/test/sandbox', mode: 'sandbox' }).onConflictDoNothing()
    expect(await shop.act((transaction) => issueClaimCode(transaction, first.id, 'hash-sandbox', NOW))).toEqual({ ok: true, channel: 'email', email: 'priya.contact@example.org', sandboxContact: true })
  })
})
