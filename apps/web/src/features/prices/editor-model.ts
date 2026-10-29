import { checkPriceRows, parseAmount } from '@hold/domain'
import type { PriceCategory } from '@hold/domain'
import { readAmount, readKind, readPastedLines } from './paste'
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

// A blank row at a place in the order, above or below another.
export function insertRow(draft: Draft, atIndex: number): Draft {
  return { ...draft, rows: [...draft.rows.slice(0, atIndex), blank(nextKey(draft.rows)), ...draft.rows.slice(atIndex)] }
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

// Where a block of cells was pasted: the focused row, and the column of the focused cell.
export type PasteTarget = { readonly rowIndex: number; readonly column: 'description' | 'kind' | 'amount' }

// A block of cells pasted onto the grid, as one change: from the focused row down, writing over rows and adding any
// past the last. Pasted at a description, each line is read as a price, as a pasted list is; pasted at an amount or a
// kind, the first cell of each line goes into that column. A kind is written only where one is named.
export function pasteAt(draft: Draft, target: PasteTarget, cells: readonly (readonly string[])[], currency: string, localKinds: Readonly<Record<string, PriceCategory>> = {}): { readonly draft: Draft; readonly count: number } {
  const changes: Partial<Omit<EditorRow, 'key'>>[] =
    target.column === 'description'
      ? readPastedLines(cells.map((line) => line.join('\t')).join('\n'), currency, localKinds).rows.map(({ category, ...row }) => (category === undefined ? row : { ...row, category }))
      : cells.map((line) => line[0] ?? '').map((cell): Partial<Omit<EditorRow, 'key'>> => {
          if (target.column === 'amount') return { amount: readAmount(cell, currency) }
          const category = readKind(cell, localKinds)
          return category === undefined ? {} : { category }
        })
  if (changes.length === 0) return { draft, count: 0 }
  const start = nextKey(draft.rows)
  const rows = [...draft.rows]
  changes.forEach((change, offset) => {
    const at = target.rowIndex + offset
    rows[at] = { ...(rows[at] ?? blank(start + at - draft.rows.length)), ...change }
  })
  return { draft: { ...draft, rows }, count: changes.length }
}
