import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { confirmedRules, decideRule, draftRule, grantStandingRule, liveStandingRule, recordReminder, remindersSentOn, revokeMandate } from './ops-settings-repository.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'

const now = new Date('2026-10-20T12:00:00Z')
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'ops-settings', now); other = await readyRentalShop(database, 'ops-settings-other', now) })
afterAll(async () => { await database.$client.close() })
const asWorker = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, work)

describe('the rules the owner keeps', () => {
  it('keeps a drafted rule out of the agent\'s memory until the owner confirms it', async () => {
    const drafted = await asWorker((transaction) => draftRule(transaction, { kind: 'below_amount', proposalKind: 'send_invoice', cents: 1000 }, null, now))
    expect(await asWorker((transaction) => confirmedRules(transaction))).toEqual([])
    await shop.act((transaction) => decideRule(transaction, drafted, shop.scope.userId ?? '', 'confirm', now))
    expect(await asWorker((transaction) => confirmedRules(transaction))).toEqual([{ kind: 'below_amount', proposalKind: 'send_invoice', cents: 1000 }])
    expect(await other.act((transaction) => confirmedRules(transaction))).toEqual([])
  })

  it('drops a rule the owner discards', async () => {
    const drafted = await asWorker((transaction) => draftRule(transaction, { kind: 'never', proposalKind: 'send_message' }, null, now))
    await shop.act((transaction) => decideRule(transaction, drafted, shop.scope.userId ?? '', 'discard', now))
    expect(await asWorker((transaction) => confirmedRules(transaction))).not.toContainEqual({ kind: 'never', proposalKind: 'send_message' })
  })
})

describe('the standing rule, a mandate the owner grants', () => {
  it('is off until granted, live until revoked, and gone at the next action after revocation', async () => {
    expect(await asWorker((transaction) => liveStandingRule(transaction, now))).toBeUndefined()
    const granted = await shop.act((transaction) => grantStandingRule(transaction, shop.scope.userId ?? '', { dailyCount: 3, days: 30 }, now))
    expect(await asWorker((transaction) => liveStandingRule(transaction, now))).toMatchObject({ id: granted, kind: 'ops_standing_rule', limits: { proposalKind: 'release_hold', condition: 'clean_return_unconfirmed', dailyCount: 3 } })
    await shop.act((transaction) => revokeMandate(transaction, granted, now))
    expect(await asWorker((transaction) => liveStandingRule(transaction, new Date(now.getTime() + 1000)))).toBeUndefined()
  })
})

describe('automatic reminders', () => {
  it('remembers which went to whom on a day, once each', async () => {
    const rental = await shop.readyRental()
    expect(await asWorker((transaction) => recordReminder(transaction, { kind: 'return_due', rentalId: rental.rentalId }, now))).toBe(true)
    expect(await asWorker((transaction) => recordReminder(transaction, { kind: 'return_due', rentalId: rental.rentalId }, now))).toBe(false)
    expect((await asWorker((transaction) => remindersSentOn(transaction, now))).map((each) => each.kind)).toEqual(['return_due'])
  })
})
