import { EMAIL_LIMITS } from '@hold/domain'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { takeEmailAllowance } from './email-allowance.ts'
import { shops } from './schema/index.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// A database of its own for each test: the pools shared by every shop would otherwise carry over from one to the next.
let database: TestDatabase
let opened = false
beforeEach(async () => {
  if (opened) await database.$client.close()
  database = await createTestDatabase()
  opened = true
})
afterAll(async () => { await database.$client.close() })

type Target = { readonly shopId: string; readonly rentalId: string | null; readonly to: string; readonly essential: boolean; readonly network: string }
const take = (target: Target) => inShop(database, { role: 'hold_app', shopId: target.shopId }, (transaction) => takeEmailAllowance(transaction, target))
const shop = async (demo: boolean) => {
  const id = randomUUID()
  await database.insert(shops).values({ id, name: 'A shop', slug: `shop-${id}`, timeZone: 'UTC', demoSession: demo })
  return id
}
let networks = 0
const freshNetwork = () => `198.51.100.${String((networks += 1) % 250)}`
const message = (shopId: string, rest: Partial<Target> = {}): Target => ({ shopId, rentalId: randomUUID(), to: `${randomUUID()}@example.com`, essential: false, network: '198.51.100.1', ...rest })
// Takes until refused, and says how many were allowed.
async function exhaust(next: () => Target): Promise<number> {
  let allowed = 0
  while (await take(next())) allowed += 1
  return allowed
}
// Spends a pool shared by many shops, a shop at a time. A pool with no ceiling runs out of shops and fails, not hangs.
const MOST_SHOPS = 12
async function exhaustAcross(demo: boolean, next: (shopId: string) => Target): Promise<number> {
  let allowed = 0
  for (let shops = 0; shops < MOST_SHOPS; shops += 1) {
    const spent = await exhaust(() => next(shopIdFor.current))
    allowed += spent
    if (spent === 0) return allowed
    shopIdFor.current = await shop(demo)
  }
  throw new Error(`No shared ceiling stopped ${String(MOST_SHOPS)} shops after ${String(allowed)} emails.`)
}
const shopIdFor = { current: '' }

// Every email leaves through one shared sending account (architecture.md section 15), so a visitor to the public demo
// must not be able to send it as many as they like, nor stop another shop's renter from getting what they need.
describe('the day’s emails', () => {
  it('stop at the limit for one rental, and a different renter of another rental still gets theirs', async () => {
    const shopId = await shop(false)
    const target = message(shopId, { to: 'renter@example.com', essential: true })
    expect(await exhaust(() => target)).toBe(EMAIL_LIMITS.perRentalPerDay)
    expect(await take(message(shopId, { essential: true }))).toBe(true)
  })

  it('stop at the limit for one address in one shop, whatever its case', async () => {
    const shopId = await shop(false)
    const to = `renter-${randomUUID()}@example.com`
    expect(await exhaust(() => message(shopId, { to, essential: true }))).toBe(EMAIL_LIMITS.perAddressPerShopPerDay)
    expect(await take(message(shopId, { to: to.toUpperCase(), essential: true }))).toBe(false)
  })

  it('stop at the limit for one shop, rental or not, of which a real shop’s essential mail may take only its share', async () => {
    const shopId = await shop(false)
    expect(await exhaust(() => message(shopId, { rentalId: null, essential: true }))).toBe(EMAIL_LIMITS.perShopEssentialPerDay)
    expect(await exhaust(() => message(shopId, { rentalId: null, essential: false }))).toBe(EMAIL_LIMITS.perShopPerDay - EMAIL_LIMITS.perShopEssentialPerDay)
  })

  it('spend nothing when refused: every limit is checked before any is counted', async () => {
    const shopId = await shop(true)
    const rentalId = randomUUID()
    const to = `full-${randomUUID()}@example.com`
    expect(await exhaust(() => message(shopId, { to, essential: true, network: freshNetwork() }))).toBe(EMAIL_LIMITS.perAddressPerShopPerDay)
    for (let tried = 0; tried < 5; tried += 1) expect(await take(message(shopId, { rentalId, to, essential: true, network: freshNetwork() }))).toBe(false)
    expect(await exhaust(() => message(shopId, { rentalId, essential: true, network: freshNetwork() }))).toBe(EMAIL_LIMITS.perRentalPerDay)
  })
})

describe('the demos’ mail', () => {
  it('stops for every demo’s essential mail together, however many networks and demos ask', async () => {
    shopIdFor.current = await shop(true)
    expect(await exhaustAcross(true, (shopId) => message(shopId, { essential: true, network: freshNetwork() }))).toBe(EMAIL_LIMITS.demoEssentialPerDay)
  })

  it('stops for every demo’s discretionary mail together, and that never starves another demo’s essential mail', async () => {
    shopIdFor.current = await shop(true)
    expect(await exhaustAcross(true, (shopId) => message(shopId, { essential: false, network: freshNetwork() }))).toBe(EMAIL_LIMITS.demoDiscretionaryPerDay)
    expect(await take(message(await shop(true), { essential: true, network: freshNetwork() }))).toBe(true)
  })

  it('stops for one network’s essential mail across its demos, counted apart from its discretionary mail', async () => {
    const network = '203.0.113.66'
    shopIdFor.current = await shop(true)
    expect(await exhaustAcross(true, (shopId) => message(shopId, { essential: true, network }))).toBe(EMAIL_LIMITS.demoEssentialPerNetworkPerDay)
    expect(await take(message(await shop(true), { essential: true, network: '203.0.113.67' }))).toBe(true)
    expect(await take(message(await shop(true), { essential: false, network }))).toBe(true)
  })

  it('stops for one network’s discretionary mail across its demos', async () => {
    const network = '203.0.113.88'
    shopIdFor.current = await shop(true)
    expect(await exhaustAcross(true, (shopId) => message(shopId, { essential: false, network }))).toBe(EMAIL_LIMITS.demoDiscretionaryPerNetworkPerDay)
    expect(await take(message(await shop(true), { essential: false, network: '203.0.113.89' }))).toBe(true)
  })

  it('stops for one address across demos, so many demos cannot bomb it, essential or not', async () => {
    const to = `victim-${randomUUID()}@example.com`
    shopIdFor.current = await shop(true)
    expect(await exhaustAcross(true, (shopId) => message(shopId, { to, essential: true, network: freshNetwork() }))).toBe(EMAIL_LIMITS.demoPerAddressPerDay)
  })

  it('never stop a real shop’s renter getting their link or a code, even once every demo limit is spent', async () => {
    const to = `renter-${randomUUID()}@example.com`
    shopIdFor.current = await shop(true)
    await exhaustAcross(true, (shopId) => message(shopId, { to, essential: true, network: freshNetwork() }))
    shopIdFor.current = await shop(true)
    await exhaustAcross(true, (shopId) => message(shopId, { essential: true, network: freshNetwork() }))
    shopIdFor.current = await shop(true)
    await exhaustAcross(true, (shopId) => message(shopId, { essential: false, network: freshNetwork() }))
    expect(await take(message(await shop(true), { essential: true, network: freshNetwork() }))).toBe(false)
    // The same renter, at a real shop: the link and a code still go.
    const real = await shop(false)
    expect(await take(message(real, { to, essential: true }))).toBe(true)
    expect(await take(message(real, { to, essential: true }))).toBe(true)
  })
})

describe('the real shops’ mail', () => {
  it('keeps a bounded day for essential mail that no demo touches, of which no one shop takes more than its share', async () => {
    const first = await shop(false)
    expect(await exhaust(() => message(first, { essential: true }))).toBe(EMAIL_LIMITS.perShopEssentialPerDay)
    shopIdFor.current = await shop(false)
    const rest = await exhaustAcross(false, (shopId) => message(shopId, { essential: true }))
    expect(EMAIL_LIMITS.perShopEssentialPerDay + rest).toBe(EMAIL_LIMITS.shopsEssentialPerDay)
    // Discretionary mail has its own day.
    expect(await take(message(await shop(false), { essential: false }))).toBe(true)
  })

  it('caps discretionary mail together, apart from essential mail', async () => {
    shopIdFor.current = await shop(false)
    expect(await exhaustAcross(false, (shopId) => message(shopId, { essential: false }))).toBe(EMAIL_LIMITS.shopsDiscretionaryPerDay)
    expect(await take(message(await shop(false), { essential: true }))).toBe(true)
  })

  it('caps discretionary mail to one address across real shops, never a real renter’s essential mail', async () => {
    const to = `copied-${randomUUID()}@example.com`
    shopIdFor.current = await shop(false)
    expect(await exhaustAcross(false, (shopId) => message(shopId, { to, essential: false }))).toBe(EMAIL_LIMITS.shopsDiscretionaryPerAddressPerDay)
    expect(await take(message(await shop(false), { to, essential: true }))).toBe(true)
  })

  it('keeps its count for an address apart from the demos’: demos sending to it never use up a real shop’s quota', async () => {
    const to = `shared-${randomUUID()}@example.com`
    shopIdFor.current = await shop(true)
    await exhaustAcross(true, (shopId) => message(shopId, { to, essential: false, network: freshNetwork() }))
    expect(await take(message(await shop(true), { to, essential: false, network: freshNetwork() }))).toBe(false)
    shopIdFor.current = await shop(false)
    expect(await exhaustAcross(false, (shopId) => message(shopId, { to, essential: false }))).toBe(EMAIL_LIMITS.shopsDiscretionaryPerAddressPerDay)
  })
})
