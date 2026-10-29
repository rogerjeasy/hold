import type { AgDataSourcesDefinition, AgExpressionFieldDefinition, AgFieldDefinition, AgReportState } from 'ag-studio'
import type { HoldRegistry } from './hold-registry'
import type { InsightsTables } from './insights-tables'

// The insights dashboard's report (extensions.md section 12.5): Hold's tables as AG Studio's data sources, with the
// measures a shop asks about first and a calendar over its money, and the dashboard it first sees. This is the display
// layer: nothing Studio works out from these rows goes back to any record.

// The report's words, in the viewer's language: the insights.report messages.
// The report the dashboard is built on. A dashboard saved on an earlier one opens as the first dashboard instead, since
// it may name fields the tables no longer have. Raise it whenever a table or field changes.
export const INSIGHTS_REPORT_VERSION = 2

export type InsightsLabels = {
  readonly description: string
  readonly calendar: string
  readonly tables: Readonly<Record<'money' | 'rentals' | 'items' | 'holds' | 'lives', string>>
  readonly fields: Readonly<Record<string, string>>
  readonly measures: Readonly<Record<string, string>>
  readonly widgets: Readonly<Record<'heldNow' | 'toShop' | 'back' | 'byMonth' | 'byType' | 'items' | 'trust' | 'life' | 'waterfall', string>>
}

const CENTS = 100
const units = (cents: number | null) => (cents === null ? null : cents / CENTS)
const field = (id: string, label: InsightsLabels, format: AgFieldDefinition<HoldRegistry>['format'], rest: Partial<AgFieldDefinition<HoldRegistry>> = {}): AgFieldDefinition<HoldRegistry> => ({ id, name: label.fields[id] ?? id, format, ...rest })

// The rows as the dashboard shows them: amounts in the shop's currency rather than cents, and dates as UTC milliseconds,
// which AG Studio reads as UTC (a Date would be read on the viewer's own clock).
export function insightsRows(tables: InsightsTables) {
  return {
    money: tables.money.map((line) => ({ line_id: line.line_id, rental_id: line.rental_id, occurred_at: line.occurred_at.getTime(), kind: line.kind, flow: line.flow, amount: units(line.amount_cents), to_shop: units(line.to_shop_cents), back: units(line.back_cents) })),
    rentals: tables.rentals.map((rental) => ({ rental_id: rental.rental_id, starts_at: rental.starts_at.getTime(), where: rental.where, held_now: units(rental.held_now_cents), reserved: units(rental.reserved_cents), captured: units(rental.captured_cents), released: units(rental.released_cents), check: rental.check, sample: rental.sample })),
    holds: tables.holds.map((hold) => ({ rental_id: hold.rental_id, trust_rung: hold.trust_rung, reserved: units(hold.reserved_cents), ordinary: units(hold.ordinary_cents), lowered: units(hold.lowered_cents), sample: hold.sample })),
    lives: tables.lives.map((life) => ({ rental_id: life.rental_id, reserved: units(life.reserved_cents), day: life.day, days: life.days, assured_days: life.assured_days, standing: life.standing, valid_until: life.valid_until.getTime(), sample: life.sample })),
    items: tables.items.map((item) => ({ item_id: item.item_id, item_type: item.item_type, item: item.item, rentals: item.rentals, days_out: item.days_out, damage_found: item.damage_found, priced: units(item.priced_cents), recovered: units(item.recovered_cents), open_marks: item.open_marks, wearing_fastest: item.wearing_fastest, sample: item.sample })),
  }
}

export function insightsData(tables: InsightsTables, { currency, locale, label, now }: { currency: string; locale: string; label: InsightsLabels; now: Date }): AgDataSourcesDefinition<HoldRegistry> {
  const money = { format: new Intl.NumberFormat(locale, { style: 'currency', currency }) }
  const amount = (id: string) => field(id, label, 'currencyFormat', { formatOptions: money })
  const rows = insightsRows(tables)
  const firstYear = Math.min(now.getUTCFullYear(), ...tables.money.map((line) => line.occurred_at.getUTCFullYear()))
  const measure = (id: string, of: string): AgExpressionFieldDefinition<HoldRegistry> => ({ id, name: label.measures[id] ?? id, isMeasure: true, format: 'currencyFormat', formatOptions: money, expression: { id: of, aggregation: 'sum' } })
  return {
    description: label.description,
    sources: [
      {
        id: 'money',
        name: label.tables.money,
        data: rows.money,
        fields: [field('line_id', label, 'textFormat', { hide: true }), field('rental_id', label, 'textFormat', { hide: true }), field('occurred_at', label, 'dateFormat'), field('kind', label, 'textFormat', { cardinality: 'low' }), field('flow', label, 'textFormat', { cardinality: 'low' }), amount('amount'), amount('to_shop'), amount('back')],
      },
      {
        id: 'rentals',
        name: label.tables.rentals,
        data: rows.rentals,
        // A rental's identifier stays visible: Hold's widgets read each rental's row by it, and Studio gives widgets no
        // hidden field. It names no one.
        fields: [field('rental_id', label, 'textFormat'), field('starts_at', label, 'dateFormat'), field('where', label, 'textFormat', { cardinality: 'low' }), amount('held_now'), amount('reserved'), amount('captured'), amount('released'), field('check', label, 'textFormat', { cardinality: 'low' }), field('sample', label, 'booleanFormat')],
      },
      {
        id: 'holds',
        name: label.tables.holds,
        data: rows.holds,
        fields: [field('rental_id', label, 'textFormat', { hide: true }), field('trust_rung', label, 'textFormat', { cardinality: 'low' }), amount('reserved'), amount('ordinary'), amount('lowered'), field('sample', label, 'booleanFormat')],
      },
      {
        id: 'lives',
        name: label.tables.lives,
        data: rows.lives,
        fields: [field('rental_id', label, 'textFormat'), amount('reserved'), field('day', label, 'integerFormat'), field('days', label, 'integerFormat'), field('assured_days', label, 'integerFormat'), field('standing', label, 'textFormat', { cardinality: 'low' }), field('valid_until', label, 'dateFormat'), field('sample', label, 'booleanFormat')],
      },
      {
        id: 'items',
        name: label.tables.items,
        data: rows.items,
        fields: [field('item_id', label, 'textFormat', { hide: true }), field('item_type', label, 'textFormat', { cardinality: 'low' }), field('item', label, 'textFormat'), field('rentals', label, 'integerFormat'), field('days_out', label, 'integerFormat'), field('damage_found', label, 'integerFormat'), amount('priced'), amount('recovered'), field('open_marks', label, 'integerFormat'), field('wearing_fastest', label, 'textFormat', { cardinality: 'low' }), field('sample', label, 'booleanFormat')],
      },
    ],
    relationships: [
      { id: 'money-rentals', source: { tableId: 'money', fieldId: 'rental_id' }, target: { tableId: 'rentals', fieldId: 'rental_id' }, type: 'many-to-one' },
      { id: 'money-calendar', source: { tableId: 'money', fieldId: 'occurred_at' }, target: { calendarId: 'calendar' } },
      { id: 'holds-rentals', source: { tableId: 'holds', fieldId: 'rental_id' }, target: { tableId: 'rentals', fieldId: 'rental_id' }, type: 'one-to-one' },
    ],
    expressions: [measure('heldNow', 'rentals.held_now'), measure('toShop', 'money.to_shop'), measure('backToRenters', 'money.back'), measure('damagePriced', 'items.priced'), measure('recovered', 'items.recovered'), measure('holdReserved', 'holds.reserved'), measure('holdOrdinary', 'holds.ordinary')],
    calendars: [{ id: 'calendar', label: label.calendar, range: { from: { type: 'date', value: `${String(firstYear)}-01-01` }, to: { type: 'date', value: `${String(now.getUTCFullYear())}-12-31` } }, fragments: ['year', 'quarter', 'month', 'monthOfYear'] }],
  }
}

const title = (text: string) => ({ title: { enabled: true, text } })

// What a shop first sees: where its money is now, what went to it and back to renters month by month, and what each
// type of item cost in damage and recovered, with every item's record below. The insights agent changes it on request.
export function insightsState(label: InsightsLabels): AgReportState<HoldRegistry> {
  return {
    selectedPageId: 'overview',
    panels: { filters: { collapsed: true }, edit: { collapsed: true }, data: { collapsed: true } },
    pages: [{
      id: 'overview',
      widgets: {
        'held-now': { type: 'value', dataMapping: { value: [{ id: 'heldNow' }] }, format: { caption: { enabled: true, text: label.widgets.heldNow } } },
        'to-shop': { type: 'value', dataMapping: { value: [{ id: 'toShop' }] }, format: { caption: { enabled: true, text: label.widgets.toShop } } },
        'back': { type: 'value', dataMapping: { value: [{ id: 'backToRenters' }] }, format: { caption: { enabled: true, text: label.widgets.back } } },
        'by-month': { type: 'column-chart-grouped', dataMapping: { categoryKey: [{ id: 'calendar::month' }], valueKey: [{ id: 'toShop' }, { id: 'backToRenters' }], tooltipKey: [] }, format: title(label.widgets.byMonth) },
        'by-type': { type: 'bar-chart-grouped', dataMapping: { categoryKey: [{ id: 'items.item_type' }], valueKey: [{ id: 'damagePriced' }, { id: 'recovered' }], tooltipKey: [] }, format: title(label.widgets.byType) },
        'trust': { type: 'column-chart-grouped', dataMapping: { categoryKey: [{ id: 'holds.trust_rung' }], valueKey: [{ id: 'holdReserved' }, { id: 'holdOrdinary' }], tooltipKey: [] }, format: title(label.widgets.trust) },
        'life': { type: 'holdLife', dataMapping: {}, format: title(label.widgets.life) },
        'waterfall': { type: 'settlementWaterfall', dataMapping: {}, format: title(label.widgets.waterfall) },
        'items': { type: 'grid', dataMapping: { cols: [{ id: 'items.item_type' }, { id: 'items.item' }, { id: 'items.rentals', aggregation: 'sum' }, { id: 'items.days_out', aggregation: 'sum' }, { id: 'items.damage_found', aggregation: 'sum' }, { id: 'items.recovered', aggregation: 'sum' }, { id: 'items.wearing_fastest' }] }, format: title(label.widgets.items) },
      },
      widgetLayout: {
        'held-now': { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 8 },
        'to-shop': { xTrack: 8, yTrack: 0, xSpan: 8, ySpan: 8 },
        'back': { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 8 },
        'by-month': { xTrack: 0, yTrack: 8, xSpan: 12, ySpan: 20 },
        'by-type': { xTrack: 12, yTrack: 8, xSpan: 12, ySpan: 20 },
        'trust': { xTrack: 0, yTrack: 28, xSpan: 8, ySpan: 22 },
        'life': { xTrack: 8, yTrack: 28, xSpan: 8, ySpan: 22 },
        'waterfall': { xTrack: 16, yTrack: 28, xSpan: 8, ySpan: 22 },
        'items': { xTrack: 0, yTrack: 50, xSpan: 24, ySpan: 28 },
      },
      filter: { page: [] },
    }],
  }
}

// The insights agent's panel lies over the canvas, so where the canvas has no room beside it, it starts folded, even
// on a dashboard left with it open; elsewhere it stays as the dashboard was left.
export function withAgentPanel(state: AgReportState<HoldRegistry>, { room }: { room: boolean }): AgReportState<HoldRegistry> {
  if (room) return state
  return { ...state, panels: { ...state.panels, ai: { ...state.panels?.ai, collapsed: true } } }
}
