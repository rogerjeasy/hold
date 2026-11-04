import { findPerson, openDemoSession, registerOwner, shops, staffRoles } from '@hold/db'
import type { Database } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { retireOldDemos, runDailyCleanup } from './demo-cleanup.ts'

vi.setConfig({ testTimeout: 60_000 })

// The daily cleanup (architecture.md section 20.3): a demo older than a week loses its two accounts and is marked
// retired. A shop that is not a demo, a demo still in its week, and any account outside the demo's domain stay.
// A shop opens on the database's clock, so the cleanup runs as if days had passed since.
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(Date.now() + 8 * DAY)
const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: Database

beforeAll(async () => {
  database = await createTestDatabase()
})

async function demo(code: string): Promise<string> {
  const opened = await openDemoSession(database, {
    owner: { subject: `owner-${code}`, email: `tomas.${code}@demo.hold.example` },
    staff: { subject: `staff-${code}`, email: `jonas.${code}@demo.hold.example` },
    slug: `ribeira-bikes-${code}`,
    paypal: PAYPAL,
    now: new Date(),
  })
  return opened.shopId
}

const retiredAt = async (shopId: string) => (await database.select({ id: shops.id, retiredAt: shops.retiredAt }).from(shops)).find((shop) => shop.id === shopId)?.retiredAt

function removal(failFor: readonly string[] = []) {
  const removed: string[] = []
  return {
    removed,
    remove: (email: string) => {
      if (failFor.includes(email)) return Promise.reject(new Error('TooManyRequestsException'))
      removed.push(email)
      return Promise.resolve()
    },
  }
}

describe('the daily demo cleanup', () => {
  it('removes the two accounts of each demo older than a week, then marks its shop retired', async () => {
    const old = await demo('clean1')
    const accounts = removal()

    const result = await retireOldDemos({ database, accounts, now: () => NOW })

    expect(accounts.removed).toEqual(['jonas.clean1@demo.hold.example', 'tomas.clean1@demo.hold.example'])
    expect(await retiredAt(old)).toEqual(NOW)
    expect(result).toEqual({ retired: 1, failed: 0 })
    expect((await findPerson(database, 'owner-clean1'))?.shops).toEqual([])
  })

  it('leaves a demo still in its week, and a shop that is not a demo however old, with their accounts', async () => {
    const young = await demo('clean2')
    const shop = await registerOwner(database, { subject: 'real-clean2', email: 'ana@douro.example', name: 'Ana', language: 'en', shop: { name: 'Douro Kayaks', timeZone: 'Europe/Lisbon' } })
    const accounts = removal()

    expect(await retireOldDemos({ database, accounts, now: () => new Date(Date.now() + 6 * DAY) })).toEqual({ retired: 0, failed: 0 })
    expect(await retiredAt(young)).toBeNull()
    await retireOldDemos({ database, accounts, now: () => NOW })
    expect(accounts.removed).not.toContain('ana@douro.example')
    expect(await retiredAt(shop.shopId)).toBeNull()
  })

  it('never removes an account outside the demo’s domain, even one working in a demo', async () => {
    const old = await demo('clean3')
    const real = await registerOwner(database, { subject: 'real-clean3', email: 'rui@douro.example', name: 'Rui', language: 'en', shop: { name: 'Douro Bikes', timeZone: 'Europe/Lisbon' } })
    await database.insert(staffRoles).values({ shopId: old, userId: real.userId, role: 'counter_staff' })
    const accounts = removal()

    await retireOldDemos({ database, accounts, now: () => NOW })

    expect(accounts.removed).toEqual(['jonas.clean3@demo.hold.example', 'tomas.clean3@demo.hold.example'])
    expect(await retiredAt(old)).toEqual(NOW)
    expect((await findPerson(database, 'real-clean3'))?.shops.map((each) => each.shopId)).toEqual([real.shopId])
  })

  it('keeps a demo whose accounts could not be removed, to try again tomorrow, and goes on with the rest', async () => {
    const stuck = await demo('clean4')
    const next = await demo('clean5')
    const accounts = removal(['tomas.clean4@demo.hold.example'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await retireOldDemos({ database, accounts, now: () => NOW })).toEqual({ retired: 1, failed: 1 })

    expect(await retiredAt(stuck)).toBeNull()
    expect(await retiredAt(next)).toEqual(NOW)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('@demo.hold.example')
    warn.mockRestore()
  })
})

describe('the daily cleanup', () => {
  it('retires old demos and removes the rate limits whose windows ended long ago, so that table stops growing', async () => {
    const client = (database as TestDatabase).$client
    await client.query(`insert into rate_limits (key, window_starts_at, count) values ('cleanup-old-window', now() - interval '3 days', 2)`)

    const result = await runDailyCleanup({ database, accounts: removal(), now: () => NOW })

    expect(result.prunedLimits).toBeGreaterThanOrEqual(1)
    expect((await client.query(`select key from rate_limits where key = 'cleanup-old-window'`)).rows).toEqual([])
  })
})
