import { beforeAll, describe, expect, it } from 'vitest'
import { presentedClaim, twoLinePrices } from './testing/presented-claim.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// Every amount is whole, non-negative cents (AGENTS.md section 6, `money` in packages/domain). The database refuses a
// negative one itself, whatever code writes it, as the last guard (migration 0050).

const NOW = new Date('2026-10-15T09:00:00Z')
let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
  const shop = await readyRentalShop(database, 'amount-checks', NOW)
  await presentedClaim(shop, await twoLinePrices(shop, NOW), shop.scope.userId ?? '', NOW)
  await database.$client.query(`insert into money_events (shop_id, rental_id, kind, currency, amount_cents, paypal_fee_cents, paypal_reference, occurred_at) select shop_id, id, 'fee_captured', 'EUR', 800, 50, 'CAPTURE-CHECKS', now() from rentals limit 1`)
  await database.$client.query(`insert into executions (shop_id, rental_id, action, idempotency_key, currency, amount_cents) select shop_id, id, 'fee_capture', 'checks-fee', 'EUR', 800 from rentals limit 1`)
}, 60_000)

const COLUMNS = [
  ['money_events', 'amount_cents'],
  ['money_events', 'paypal_fee_cents'],
  ['holds', 'reserved_cents'],
  ['holds', 'ordinary_cents'],
  ['executions', 'amount_cents'],
  ['claims', 'total_cents'],
  ['claim_lines', 'amount_cents'],
] as const

describe('an amount column', () => {
  it.each(COLUMNS)('%s.%s refuses a negative amount', async (table, column) => {
    const [row] = (await database.$client.query<{ id: string }>(`select id from ${table} limit 1`)).rows
    expect(row).toBeDefined()
    await expect(database.$client.query(`update ${table} set ${column} = -1 where id = $1`, [row?.id])).rejects.toThrow(/check constraint/)
  })
})
