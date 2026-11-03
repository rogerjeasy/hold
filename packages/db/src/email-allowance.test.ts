import { EMAIL_LIMITS } from '@hold/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { takeEmailAllowance } from './email-allowance.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

type Target = { readonly shopId: string; readonly rentalId: string | null; readonly to: string }
const take = (target: Target) => inShop(database, { role: 'hold_app', shopId: target.shopId }, (transaction) => takeEmailAllowance(transaction, target))

// Every email leaves through one shared sending account (architecture.md section 15), so a visitor to the public demo
// must not be able to send it as many as they like.
describe('the day’s emails', () => {
  it('stop at the limit for one rental, and a different renter of another rental still gets theirs', async () => {
    const shopId = randomUUID()
    const target = { shopId, rentalId: randomUUID(), to: 'renter@example.com' }
    for (let sent = 0; sent < EMAIL_LIMITS.perRentalPerDay; sent += 1) expect(await take(target)).toBe(true)
    expect(await take(target)).toBe(false)
    expect(await take({ shopId, rentalId: randomUUID(), to: 'someone-else@example.com' })).toBe(true)
  })

  it('stop at the limit for one address across rentals and shops, whatever its case', async () => {
    const to = `judge-${randomUUID()}@example.com`
    for (let sent = 0; sent < EMAIL_LIMITS.perAddressPerDay; sent += 1) expect(await take({ shopId: randomUUID(), rentalId: randomUUID(), to })).toBe(true)
    expect(await take({ shopId: randomUUID(), rentalId: randomUUID(), to: to.toUpperCase() })).toBe(false)
  })

  it('stop at the limit for one shop, rental or not, such as staff invitations', async () => {
    const shopId = randomUUID()
    for (let sent = 0; sent < EMAIL_LIMITS.perShopPerDay; sent += 1) expect(await take({ shopId, rentalId: null, to: `staff-${String(sent)}@example.com` })).toBe(true)
    expect(await take({ shopId, rentalId: null, to: 'one-more@example.com' })).toBe(false)
    expect(await take({ shopId: randomUUID(), rentalId: null, to: 'one-more@example.com' })).toBe(true)
  })

  it('stop for every shop together once the day’s emails are spent, leaving the sending account room for sign-in codes', async () => {
    let allowed = 0
    while (await take({ shopId: randomUUID(), rentalId: null, to: `visitor-${String(allowed)}@example.com` })) allowed += 1
    // Earlier tests in this file spent some of the same day.
    expect(allowed).toBeLessThanOrEqual(EMAIL_LIMITS.perDay)
    expect(await take({ shopId: randomUUID(), rentalId: randomUUID(), to: 'fresh@example.com' })).toBe(false)
  })
})
