import { afterAll, beforeAll, expect, it } from 'vitest'
import { registerOwner } from './accounts.ts'
import { shopsForOperations } from './ops-repository.ts'
import { savePayPalAccount } from './shop-repository.ts'
import { inShop } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

const shop = async (subject: string) => {
  const registered = await registerOwner(database, { subject, email: `${subject}@shop.example`, name: 'Ana', language: 'en', shop: { name: subject, timeZone: 'UTC' } })
  return { ...registered, act: <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop(database, { role: 'hold_app', shopId: registered.shopId, userId: registered.userId }, work) }
}

it('lists, for the nightly run, every shop with a PayPal account in the worker\'s mode and no other', async () => {
  const connected = await shop('ops-connected')
  const live = await shop('ops-live')
  await shop('ops-unconnected')
  await connected.act((transaction) => savePayPalAccount(transaction, connected.shopId, 'sandbox', 'hold/paypal/shops/a/sandbox'))
  await live.act((transaction) => savePayPalAccount(transaction, live.shopId, 'live', 'hold/paypal/shops/b/live'))
  expect(await shopsForOperations(database, 'sandbox')).toEqual([connected.shopId])
})
