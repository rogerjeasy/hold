// @vitest-environment node
import { decisionRecords, findPerson, inShop, openDemoSession } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { describe, expect, it, vi } from 'vitest'
import { boardBrief, boardRows } from '@/features/decisions/board'
import { decisionsFor } from './decisions'

vi.setConfig({ testTimeout: 60_000 })

const NOW = new Date('2026-12-01T09:00:00Z')

// Today once said "5 things need a decision" while the decision board listed 7 on the same demo shop (audit finding
// JW-L3). Both now read the board's rows, so on the demo's own sample data they say the same number.
describe('what Today counts against the decision board', () => {
  it('is the same number on a fresh demo shop, for the owner and for the counter', async () => {
    const database = await createTestDatabase()
    const opened = await openDemoSession(database, {
      owner: { subject: 'owner-count1', email: 'tomas.count1@demo.hold.example' },
      staff: { subject: 'staff-count1', email: 'jonas.count1@demo.hold.example' },
      slug: 'ribeira-bikes-count1',
      paypal: { credentialReference: 'hold/paypal/shops/demo/sandbox', mode: 'sandbox' },
      now: NOW,
    })
    for (const [subject, role, approvalLimitCents] of [['owner-count1', 'owner', 0], ['staff-count1', 'counter_staff', 100_00]] as const) {
      const person = await findPerson(database, subject)
      const userId = person?.userId ?? ''
      const records = await inShop(database, { role: 'hold_app', shopId: opened.shopId, userId }, (transaction) => decisionRecords(transaction, NOW))
      const rows = boardRows(records, { userId, role, approvalLimitCents }, NOW)
      const today = decisionsFor(rows)
      expect(today.length).toBe(boardBrief(rows, NOW).decisions)
      expect(today.length).toBeGreaterThan(0)
      // The agent's proposals wait on the board, so Today names them too.
      expect(today.some((decision) => decision.kind === 'board')).toBe(true)
    }
  })
})
