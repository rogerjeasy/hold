import { shopDay } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson } from './accounts.ts'
import { decisionRecords } from './decision-records.ts'
import { openDemoSession } from './demo-session.ts'
import { morningQueue } from './ops-repository.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { dropOffsWaiting } from './self-return-repository.ts'
import { shopSetup, shopToday } from './shop-today.ts'
import { countStatements } from './testing/statement-count.ts'
import type { StatementCount } from './testing/statement-count.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

// How many statements the slowest shop pages read, on a demo shop as busy as a judge's. Deployed, each statement is a
// call to the RDS Data API that the page waits for (tech-stack.md section 10), so these numbers are the page's speed:
// a change that reads row by row again, or puts reads that could run side by side one after another, fails here rather
// than in front of a judge. Each count includes the statement that binds a transaction to the shop.
const NOW = new Date('2026-12-01T09:00:00Z')
const PAYPAL = { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' as const }

let database: TestDatabase
let scope: Scope

beforeAll(async () => {
  database = await createTestDatabase()
  const opened = await openDemoSession(database, { owner: { subject: 'owner-pages', email: 'tomas.pages@demo.hold.example' }, staff: { subject: 'staff-pages', email: 'jonas.pages@demo.hold.example' }, slug: 'ribeira-bikes-pages', paypal: PAYPAL, now: NOW })
  scope = { role: 'hold_app', shopId: opened.shopId, userId: (await findPerson(database, 'owner-pages'))?.userId ?? '' }
})

async function inOneTransaction(read: (transaction: Transaction) => Promise<unknown>): Promise<StatementCount> {
  return (await countStatements(database, () => inShop(database, scope, read))).count
}

describe('the statements a shop page reads', () => {
  it('reads the Today page’s figures and lists in eight, and its setup in one', async () => {
    const window = { now: NOW, day: shopDay('Europe/Lisbon', NOW) }
    const today = await inShop(database, scope, (transaction) => shopToday(transaction, window))
    // The demo is busy enough that every list has something in it.
    expect(today.rentals.total).toBeGreaterThan(0)
    expect(today.activeHolds.length).toBeGreaterThan(0)
    expect(today.droppedOff.length).toBeGreaterThan(0)

    expect(await inOneTransaction((transaction) => shopToday(transaction, window))).toEqual({ statements: 9, transactions: 1, longest: 9 })
    expect(await inOneTransaction(shopSetup)).toEqual({ statements: 2, transactions: 1, longest: 2 })
  })

  it('reads the drop-offs waiting in four, however many there are and however many items each brought', async () => {
    const waiting = await inShop(database, scope, dropOffsWaiting)
    expect(waiting.length).toBeGreaterThan(0)
    expect(waiting.flatMap((dropOff) => dropOff.items).every((item) => item.before !== null && item.after !== null)).toBe(true)

    expect(await inOneTransaction(dropOffsWaiting)).toEqual({ statements: 5, transactions: 1, longest: 5 })
  })

  it('reads the morning queue, with the amount each entry would act on, in four, however many entries there are', async () => {
    const entries = await inShop(database, scope, (transaction) => morningQueue(transaction, NOW))
    expect(entries.filter((entry) => entry.amountCents !== null).length).toBeGreaterThan(1)

    expect(await inOneTransaction((transaction) => morningQueue(transaction, NOW))).toEqual({ statements: 5, transactions: 1, longest: 5 })
  })

  it('reads the decision board in four transactions side by side, the longest of seven statements', async () => {
    const { result, count } = await countStatements(database, () => decisionRecords(database, scope, NOW))
    expect(result.claims.length).toBeGreaterThan(0)
    expect(result.proposals.length).toBeGreaterThan(0)
    expect(result.dropOffs.length).toBeGreaterThan(0)
    expect(result.holds.length).toBeGreaterThan(0)

    expect(count).toEqual({ statements: 21, transactions: 4, longest: 7 })
  })
})
