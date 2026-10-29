import { describe, expect, it } from 'vitest'
import { insightsData, insightsRows, insightsState, withAgentPanel } from './insights-report'
import type { InsightsLabels } from './insights-report'
import type { InsightsTables } from './insights-tables'

// The insights dashboard's report (extensions.md section 12.5): Hold's tables as AG Studio's data sources, with their
// measures and calendar, and the dashboard a shop first sees. Every field a widget names must exist in the data.

const tables: InsightsTables = {
  money: [{ line_id: '1', rental_id: 'r1', occurred_at: new Date('2025-11-02T10:00:00Z'), kind: 'Taken from the hold', flow: 'To the shop', amount_cents: 35_00, to_shop_cents: 35_00, back_cents: null }],
  rentals: [{ rental_id: 'r1', starts_at: new Date('2025-11-01T09:00:00Z'), where: 'Taken by the shop', held_now_cents: 0, to_shop_cents: 35_00, back_cents: 0, reserved_cents: 250_00, captured_cents: 35_00, released_cents: 215_00, check: 'Agrees', sample: true }],
  holds: [{ rental_id: 'r1', trust_rung: 'Rung 2', reserved_cents: 250_00, ordinary_cents: 300_00, lowered_cents: 50_00, sample: true }],
  lives: [{ rental_id: 'r2', reserved_cents: 300_00, day: 14, days: 29, assured_days: 3, standing: 'Valid', valid_until: new Date('2026-10-30T10:00:00Z'), sample: false }],
  items: [{ item_id: 'i1', item_type: 'Hybrid bike', item: 'Hybrid bike 1', rentals: 1, days_out: 3, damage_found: 1, priced_cents: 35_00, recovered_cents: 35_00, open_marks: 1, wearing_fastest: 'No', sample: true }],
}
const label: InsightsLabels = {
  description: 'label:description',
  calendar: 'label:calendar',
  tables: { money: 'label:money', rentals: 'label:rentals', items: 'label:items', holds: 'label:holds', lives: 'label:lives' },
  fields: new Proxy({}, { get: (_target, key) => `label:${String(key)}` }),
  measures: new Proxy({}, { get: (_target, key) => `label:${String(key)}` }),
  widgets: { heldNow: 'label:heldNow', toShop: 'label:toShop', back: 'label:back', byMonth: 'label:byMonth', byType: 'label:byType', items: 'label:items', trust: 'label:trust', life: 'label:life', waterfall: 'label:waterfall' },
}
const data = insightsData(tables, { currency: 'EUR', locale: 'en', label, now: new Date('2026-10-29T10:00:00Z') })

describe('the insights dashboard’s data', () => {
  it('shows cents in the shop’s currency, and dates as UTC milliseconds', () => {
    expect(insightsRows(tables).money).toEqual([{ line_id: '1', rental_id: 'r1', occurred_at: Date.parse('2025-11-02T10:00:00Z'), kind: 'Taken from the hold', flow: 'To the shop', amount: 35, to_shop: 35, back: null }])
    expect(insightsRows(tables).items[0]).toMatchObject({ priced: 35, recovered: 35, damage_found: 1 })
    expect(insightsRows(tables).holds[0]).toMatchObject({ trust_rung: 'Rung 2', reserved: 250, ordinary: 300, lowered: 50 })
    expect(insightsRows(tables).lives[0]).toMatchObject({ day: 14, days: 29, reserved: 300, valid_until: Date.parse('2026-10-30T10:00:00Z') })
    expect(data.sources.find((source) => source.id === 'money')).toMatchObject({ data: insightsRows(tables).money })
  })

  it('names its fields in the viewer’s language, and spans a calendar from the first year of its money to this one', () => {
    expect(data.sources.flatMap((source) => ('fields' in source ? source.fields ?? [] : [])).every((field) => field.name?.startsWith('label:'))).toBe(true)
    expect(data.calendars?.[0]?.range).toEqual({ from: { type: 'date', value: '2025-01-01' }, to: { type: 'date', value: '2026-12-31' } })
  })
})

describe('the dashboard a shop first sees', () => {
  it('has every field Hold’s own widgets read: each live hold’s line, and each rental’s reserved, captured and released', () => {
    const fields = new Set(data.sources.flatMap((source) => ('fields' in source ? (source.fields ?? []).map((field) => `${source.id}.${field.id}`) : [])))
    for (const id of ['lives.rental_id', 'lives.day', 'lives.days', 'lives.assured_days', 'lives.standing', 'lives.reserved', 'rentals.reserved', 'rentals.captured', 'rentals.released']) expect(fields).toContain(id)
    expect(Object.values(insightsState(label).pages[0]?.widgets ?? {}).map((widget) => widget?.type)).toEqual(expect.arrayContaining(['holdLife', 'settlementWaterfall', 'column-chart-grouped']))
  })

  it('names only fields and measures the data has', () => {
    const fields = new Set(data.sources.flatMap((source) => ('fields' in source ? (source.fields ?? []).map((field) => `${source.id}.${field.id}`) : [])))
    const measures = new Set((data.expressions ?? []).map((expression) => expression.id))
    const state = insightsState(label)
    const named = state.pages.flatMap((page) => Object.values(page.widgets ?? {})).flatMap((widget): unknown[] => Object.values(widget?.dataMapping ?? {}).flat()).flatMap((reference) => (typeof reference === 'object' && reference !== null && 'id' in reference && typeof reference.id === 'string' ? [reference.id] : []))
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter((id) => !fields.has(id) && !measures.has(id) && !id.startsWith('calendar::'))).toEqual([])
  })
})

describe('the insights agent’s panel', () => {
  it('opens where the canvas has room beside it, keeping a dashboard’s other panels as they were left', () => {
    const left = { ...insightsState(label), panels: { ai: { collapsed: true, width: 420 }, data: { collapsed: false } } }
    expect(withAgentPanel(left, { room: true }).panels).toEqual({ ai: { collapsed: true, width: 420 }, data: { collapsed: false } })
    expect(withAgentPanel(insightsState(label), { room: true }).panels?.ai?.collapsed).not.toBe(true)
  })

  it('starts folded where it would cover the dashboard, even on a dashboard left with it open', () => {
    const left = { ...insightsState(label), panels: { ai: { collapsed: false, width: 420 }, data: { collapsed: true } } }
    expect(withAgentPanel(left, { room: false }).panels).toEqual({ ai: { collapsed: true, width: 420 }, data: { collapsed: true } })
    expect(withAgentPanel(insightsState(label), { room: false }).pages).toEqual(insightsState(label).pages)
  })
})
