import { TEXT_LIMITS } from '@hold/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { inShop } from './scope.ts'
import { takeTextAllowance } from './text-allowance.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

describe('the day’s texts', () => {
  it('stop at the limit for one rental, and for one number across rentals, so nobody runs up the shop’s bill', async () => {
    const shopId = randomUUID()
    // The worker counts as well as the web app, inside the transaction that sends.
    const take = (target: { readonly rentalId: string; readonly phone: string }, role: 'hold_app' | 'hold_worker' = 'hold_app') => inShop(database, { role, shopId }, (transaction) => takeTextAllowance(transaction, { shopId, ...target }))
    const target = { rentalId: 'rental-a', phone: '+41791234567' }
    for (let sent = 0; sent < TEXT_LIMITS.perRentalPerDay; sent += 1) expect(await take(target, sent % 2 === 0 ? 'hold_app' : 'hold_worker')).toBe(true)
    expect(await take(target)).toBe(false)
    // Another rental to the same number is stopped by the number's own limit.
    expect(await take({ ...target, rentalId: 'rental-b' })).toBe(false)
    expect(await take({ rentalId: 'rental-c', phone: '+41797654321' }, 'hold_worker')).toBe(true)
  })
})
