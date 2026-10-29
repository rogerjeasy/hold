import { describe, expect, it } from 'vitest'
import { insightsTables } from './insights-tables'
import type { InsightsHold, InsightsItem, InsightsLine, InsightsRental, InsightsWords } from './insights-tables'

// The insights dashboard's tables (extensions.md section 12.5): the money ledger's lines and rentals and the fleet's
// items, as AG Studio's data engine reads them. Every figure is the one those pages show; no renter is named.

const words: InsightsWords = {
  kind: (kind) => `kind:${kind}`,
  flow: (flow) => `flow:${flow}`,
  where: (where) => `where:${where}`,
  agrees: 'Agrees',
  needsLook: 'Needs a look',
  yes: 'Yes',
  no: 'No',
  rung: (rung) => (rung === null ? 'No rung' : `Rung ${String(rung)}`),
  standing: (standing) => `standing:${standing}`,
}
const at = new Date('2026-10-03T10:00:00Z')
const startsAt = new Date('2026-10-01T09:00:00Z')
const line = (id: string, kind: InsightsLine['kind'], flow: InsightsLine['flow'], amountCents: number): InsightsLine => ({ id, rentalId: 'r1', kind, flow, amountCents, occurredAt: at })
const lines = [line('1', 'hold_placed', 'held', 250_00), line('2', 'hold_captured', 'to_shop', 35_00), line('3', 'hold_released', 'to_renter', 215_00)]
const rentals: InsightsRental[] = [{ rentalId: 'r1', renterName: 'Priya Natarajan', startsAt, simulated: true, reservedCents: 250_00, trustRung: 2, ordinaryCents: 300_00, money: { heldNowCents: 0, toShopCents: 35_00, backCents: 215_00, invoicedUnpaidCents: 0, where: 'taken', checks: [] } }]
const NOW = new Date('2026-10-14T10:00:00Z')
// A hold placed on the first of October: day 14 of its 29, past its assured days.
const live: InsightsHold[] = [{ rentalId: 'r2', reservedCents: 300_00, createdAt: new Date('2026-10-01T10:00:00Z'), assuredUntil: new Date('2026-10-04T10:00:00Z'), validUntil: new Date('2026-10-30T10:00:00Z'), simulated: false }]
const items: InsightsItem[] = [{ kind: 'item', item: { id: 'i1', label: 'Hybrid bike 1', simulated: true }, type: { name: 'Hybrid bike' }, wear: { rentals: 1, damageFindings: 1, findingsByRental: [1], incurredCents: 35_00, recoveredCents: 35_00, daysOut: 3 }, openMarks: 1, fastest: false }]

describe('the insights dashboard’s tables', () => {
  it('gives each money line what it did and where its money went, in cents, with its rental', () => {
    const { money } = insightsTables({ lines, rentals, fleet: items, holds: live, now: NOW }, words)
    expect(money).toEqual([
      { line_id: '1', rental_id: 'r1', occurred_at: new Date('2026-10-03T10:00:00Z'), kind: 'kind:hold_placed', flow: 'flow:held', amount_cents: 250_00, to_shop_cents: null, back_cents: null },
      { line_id: '2', rental_id: 'r1', occurred_at: new Date('2026-10-03T10:00:00Z'), kind: 'kind:hold_captured', flow: 'flow:to_shop', amount_cents: 35_00, to_shop_cents: 35_00, back_cents: null },
      { line_id: '3', rental_id: 'r1', occurred_at: new Date('2026-10-03T10:00:00Z'), kind: 'kind:hold_released', flow: 'flow:to_renter', amount_cents: 215_00, to_shop_cents: null, back_cents: 215_00 },
    ])
  })

  it('gives each rental where its money is and what its checks found, and each item what its rentals say, naming no renter', () => {
    const tables = insightsTables({ lines, rentals, fleet: items, holds: live, now: NOW }, words)
    expect(tables.rentals).toEqual([{ rental_id: 'r1', starts_at: startsAt, where: 'where:taken', held_now_cents: 0, to_shop_cents: 35_00, back_cents: 215_00, reserved_cents: 250_00, captured_cents: 35_00, released_cents: 215_00, check: 'Agrees', sample: true }])
    expect(tables.items).toEqual([{ item_id: 'i1', item_type: 'Hybrid bike', item: 'Hybrid bike 1', rentals: 1, days_out: 3, damage_found: 1, priced_cents: 35_00, recovered_cents: 35_00, open_marks: 1, wearing_fastest: 'No', sample: true }])
    expect(JSON.stringify(tables)).not.toContain('Priya')
  })

  it('gives each hold the rung of the trust ladder that lowered it and by how much, and each live hold its day of 29', () => {
    const tables = insightsTables({ lines, rentals, fleet: items, holds: live, now: NOW }, words)
    expect(tables.holds).toEqual([{ rental_id: 'r1', trust_rung: 'Rung 2', reserved_cents: 250_00, ordinary_cents: 300_00, lowered_cents: 50_00, sample: true }])
    expect(tables.lives).toEqual([{ rental_id: 'r2', reserved_cents: 300_00, day: 14, days: 29, assured_days: 3, standing: 'standing:valid', valid_until: new Date('2026-10-30T10:00:00Z'), sample: false }])
  })
})
