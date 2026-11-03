import { EMAIL_LIMITS } from '@hold/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { takeEmailAllowance } from './email-allowance.ts'
import { shops } from './schema/index.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

type Target = { readonly shopId: string; readonly rentalId: string | null; readonly to: string; readonly essential: boolean; readonly network: string }
const take = (target: Target) => inShop(database, { role: 'hold_app', shopId: target.shopId }, (transaction) => takeEmailAllowance(transaction, target))
const shop = async (demo: boolean) => {
  const id = randomUUID()
  await database.insert(shops).values({ id, name: 'A shop', slug: `shop-${id}`, timeZone: 'UTC', demoSession: demo })
  return id
}
const message = (shopId: string, rest: Partial<Target> = {}): Target => ({ shopId, rentalId: randomUUID(), to: `${randomUUID()}@example.com`, essential: false, network: '198.51.100.1', ...rest })
// Takes until refused, and says how many were allowed.
async function exhaust(next: () => Target): Promise<number> {
  let allowed = 0
  while (await take(next())) allowed += 1
  return allowed
}

// Every email leaves through one shared sending account (architecture.md section 15), so a visitor to the public demo
// must not be able to send it as many as they like, nor stop another shop's renter from getting what they need.
describe('the day’s emails', () => {
  it('stop at the limit for one rental, and a different renter of another rental still gets theirs', async () => {
    const shopId = await shop(false)
    const target = message(shopId, { to: 'renter@example.com' })
    expect(await exhaust(() => target)).toBe(EMAIL_LIMITS.perRentalPerDay)
    expect(await take(message(shopId))).toBe(true)
  })

  it('stop at the limit for one address in one shop, whatever its case, while another shop still reaches it', async () => {
    const shopId = await shop(false)
    const to = `judge-${randomUUID()}@example.com`
    expect(await exhaust(() => message(shopId, { to }))).toBe(EMAIL_LIMITS.perAddressPerShopPerDay)
    expect(await take(message(shopId, { to: to.toUpperCase() }))).toBe(false)
    expect(await take(message(await shop(false), { to }))).toBe(true)
  })

  it('stop at the limit for one shop, rental or not, such as staff invitations', async () => {
    const shopId = await shop(false)
    expect(await exhaust(() => message(shopId, { rentalId: null }))).toBe(EMAIL_LIMITS.perShopPerDay)
  })

  it('spend nothing when refused: every limit is checked before any is counted', async () => {
    const shopId = await shop(false)
    const rentalId = randomUUID()
    const to = `full-${randomUUID()}@example.com`
    // Fill the address's limit through other rentals, then ask for this rental: refused by the address alone.
    expect(await exhaust(() => message(shopId, { to }))).toBe(EMAIL_LIMITS.perAddressPerShopPerDay)
    for (let tried = 0; tried < 5; tried += 1) expect(await take(message(shopId, { rentalId, to }))).toBe(false)
    // This rental's own limit was never touched by those refusals.
    expect(await exhaust(() => message(shopId, { rentalId }))).toBe(EMAIL_LIMITS.perRentalPerDay)
  })

  it('cap the discretionary mail of every demo together, so a visitor with many demos runs out', async () => {
    let allowed = 0
    for (let demo = 0; demo < Math.ceil(EMAIL_LIMITS.demoDiscretionaryPerDay / EMAIL_LIMITS.perShopPerDay) + 1; demo += 1) {
      const shopId = await shop(true)
      allowed += await exhaust(() => message(shopId, { rentalId: null }))
    }
    expect(allowed).toBe(EMAIL_LIMITS.demoDiscretionaryPerDay)
  })

  it('cap one network’s essential mail across its demos, so the demo is never a relay, without touching anyone else’s', async () => {
    const network = '203.0.113.66'
    let allowed = 0
    for (let demo = 0; demo < Math.ceil(EMAIL_LIMITS.demoEssentialPerNetworkPerDay / EMAIL_LIMITS.perShopPerDay) + 1; demo += 1) {
      const shopId = await shop(true)
      allowed += await exhaust(() => message(shopId, { essential: true, network }))
    }
    expect(allowed).toBe(EMAIL_LIMITS.demoEssentialPerNetworkPerDay)
    // Another judge's demo, on another network, still gets its renter's link and codes.
    expect(await take(message(await shop(true), { essential: true, network: '203.0.113.67' }))).toBe(true)
  })

  it('never let one tenant, having spent every limit it can reach, stop another shop’s renter getting a code or a link', async () => {
    const network = '192.0.2.10'
    // A visitor spends every demo limit it can reach: the demos' discretionary day and its network's essential mail.
    for (let demo = 0; demo < 8; demo += 1) {
      const shopId = await shop(true)
      await exhaust(() => message(shopId, { rentalId: null }))
      await exhaust(() => message(shopId, { essential: true, network }))
    }
    // A real shop's renter still gets the link and a code, and the real shops' discretionary mail is untouched.
    const real = await shop(false)
    expect(await take(message(real, { essential: true, network }))).toBe(true)
    expect(await take(message(real, { essential: false, network }))).toBe(true)
    // So does another demo's renter, on another network.
    expect(await take(message(await shop(true), { essential: true, network: '192.0.2.11' }))).toBe(true)
  })

  it('cap the real shops’ discretionary mail together, apart from the demos’', async () => {
    let allowed = 0
    for (let real = 0; real < Math.ceil(EMAIL_LIMITS.shopsDiscretionaryPerDay / EMAIL_LIMITS.perShopPerDay) + 1; real += 1) {
      const shopId = await shop(false)
      allowed += await exhaust(() => message(shopId, { rentalId: null }))
    }
    // Earlier tests here spent part of the real shops' day, and the demos' spent day took none of it.
    expect(allowed).toBeGreaterThan(0)
    expect(allowed).toBeLessThanOrEqual(EMAIL_LIMITS.shopsDiscretionaryPerDay)
    expect(await take(message(await shop(false), { rentalId: null }))).toBe(false)
    // Essential mail never counts against that day: a real renter still gets their link.
    expect(await take(message(await shop(false), { essential: true }))).toBe(true)
  })
})
