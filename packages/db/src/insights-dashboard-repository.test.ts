import { beforeAll, describe, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { saveInsightsDashboard, savedInsightsDashboard } from './insights-dashboard-repository.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// A shop's own insights dashboard (extensions.md section 12.5): saved as AG Studio left it, read back on the next
// visit, written over on each save, and seen by no other shop.

const NOW = new Date('2026-10-29T10:00:00Z')
let database: TestDatabase
let shop: Scope & { readonly userId: string }
let other: Scope & { readonly userId: string }

async function owner(subject: string, name: string) {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name, language: 'en', shop: { name, timeZone: 'Europe/Lisbon' } })
  return { role: 'hold_app' as const, shopId: registered.shopId, userId: registered.userId }
}

const read = (scope: Scope) => inShop(database, scope, (transaction) => savedInsightsDashboard(transaction))
const save = (scope: Scope & { readonly userId: string }, state: Record<string, unknown>, reportVersion: number, at: Date) =>
  inShop(database, scope, (transaction) => saveInsightsDashboard(transaction, { shopId: scope.shopId, userId: scope.userId, state, reportVersion, at }))

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await owner('owner-insights', 'Ribeira Bikes')
  other = await owner('owner-insights-other', 'Douro Kayaks')
})

describe('a shop’s own insights dashboard', () => {
  it('is none until it is saved, then reads back as it was saved, with the report it was built on', async () => {
    expect(await read(shop)).toBeUndefined()
    await save(shop, { selectedPageId: 'overview', pages: [{ id: 'overview' }] }, 2, NOW)
    expect(await read(shop)).toEqual({ state: { selectedPageId: 'overview', pages: [{ id: 'overview' }] }, reportVersion: 2, updatedAt: NOW })
  })

  it('is written over by the next save, so a shop keeps one', async () => {
    const later = new Date('2026-10-29T11:00:00Z')
    await save(shop, { selectedPageId: 'money', pages: [{ id: 'money' }] }, 2, later)
    expect(await read(shop)).toMatchObject({ state: { selectedPageId: 'money' }, updatedAt: later })
  })

  it('is seen by no other shop, which keeps its own', async () => {
    expect(await read(other)).toBeUndefined()
    await save(other, { selectedPageId: 'kayaks', pages: [] }, 2, NOW)
    expect(await read(other)).toMatchObject({ state: { selectedPageId: 'kayaks' } })
    expect(await read(shop)).toMatchObject({ state: { selectedPageId: 'money' } })
  })
})
