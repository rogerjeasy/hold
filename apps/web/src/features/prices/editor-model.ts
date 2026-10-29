import { checkPriceRows, parseAmount } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import type { PastedRow } from './paste'

// The draft of the next version of a shop's terms, as plain values: every change makes a new draft, so the undo
// history can hold each one. An amount stays as typed until it is published; the checks read it from there.

export type EditorRow = { readonly key: number; readonly description: string; readonly category: PriceCategory; readonly amount: string }
export type Draft = { readonly rows: readonly EditorRow[]; readonly wearPolicy: string }

const blank = (key: number): EditorRow => ({ key, description: '', category: 'damage', amount: '' })
const isBlank = (row: EditorRow) => row.description.trim() === '' && row.amount.trim() === ''
const nextKey = (rows: readonly EditorRow[]) => rows.reduce((most, row) => Math.max(most, row.key + 1), 0)

export const emptyDraft = (): Draft => ({ rows: [blank(0)], wearPolicy: '' })

export function appendRows(draft: Draft, pasted: readonly PastedRow[]): Draft {
  const kept = draft.rows.length === 1 && draft.rows[0] !== undefined && isBlank(draft.rows[0]) ? [] : draft.rows
  const start = nextKey(draft.rows)
  return { ...draft, rows: [...kept, ...pasted.map((row, index) => ({ key: start + index, ...row }))] }
}

export function addRow(draft: Draft): Draft {
  return { ...draft, rows: [...draft.rows, blank(nextKey(draft.rows))] }
}

export function updateRow(draft: Draft, key: number, change: Partial<Omit<EditorRow, 'key'>>): Draft {
  return { ...draft, rows: draft.rows.map((row) => (row.key === key ? { ...row, ...change } : row)) }
}

// The last row removed leaves a blank one, so there is always somewhere to type.
export function removeRow(draft: Draft, key: number): Draft {
  const rows = draft.rows.filter((row) => row.key !== key)
  return { ...draft, rows: rows.length === 0 ? [blank(nextKey(draft.rows))] : rows }
}

// The order is the order renters read.
export function moveRow(draft: Draft, key: number, toIndex: number): Draft {
  const row = draft.rows.find((each) => each.key === key)
  if (row === undefined) return draft
  const rest = draft.rows.filter((each) => each.key !== key)
  return { ...draft, rows: [...rest.slice(0, toIndex), row, ...rest.slice(toIndex)] }
}

// The entries as a renter would read them and a diff compares them, leaving out any row publishing would refuse.
export function draftEntries(draft: Draft, currency: string): { description: string; category: PriceCategory; amountCents: number }[] {
  const problems = checkPriceRows(draft.rows, currency)
  return draft.rows.flatMap((row, index) => {
    const amount = parseAmount(row.amount, currency)
    const fine = Object.keys(problems[index] ?? {}).length === 0
    return !fine || amount === undefined ? [] : [{ description: row.description.trim(), category: row.category, amountCents: amount.cents }]
  })
}
