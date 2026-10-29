import { describe, expect, it } from 'vitest'
import { appendRows, draftEntries, emptyDraft, insertRow, moveRow, pasteAt, removeRow, updateRow } from './editor-model'

// The draft as plain values: every change makes a new draft, so the undo history can hold each one.
describe('the draft', () => {
  const draft = { rows: [{ key: 0, description: 'Deep scratch', category: 'damage' as const, amount: '35' }, { key: 1, description: 'Lost lock', category: 'loss' as const, amount: '45' }], wearPolicy: 'Scuffs are wear.' }

  it('adds pasted rows after the others, taking the place of a blank starting row', () => {
    expect(appendRows(draft, [{ description: 'Bent wheel', category: 'damage', amount: '90' }]).rows.map((row) => [row.key, row.description])).toEqual([[0, 'Deep scratch'], [1, 'Lost lock'], [2, 'Bent wheel']])
    expect(appendRows(emptyDraft(), [{ description: 'Bent wheel', category: 'damage', amount: '90' }]).rows.map((row) => row.description)).toEqual(['Bent wheel'])
  })

  it('changes, removes and moves a row without touching the draft it came from', () => {
    expect(updateRow(draft, 1, { amount: '50' }).rows[1]?.amount).toBe('50')
    expect(draft.rows[1]?.amount).toBe('45')
    expect(removeRow(draft, 0).rows.map((row) => row.key)).toEqual([1])
    expect(moveRow(draft, 1, 0).rows.map((row) => row.key)).toEqual([1, 0])
  })

  it('adds a blank row at a place in the order, above or below another', () => {
    expect(insertRow(draft, 1).rows.map((row) => [row.key, row.description])).toEqual([[0, 'Deep scratch'], [2, ''], [1, 'Lost lock']])
    expect(insertRow(draft, 2).rows.map((row) => row.key)).toEqual([0, 1, 2])
  })

  it('keeps a blank row to type into when the last one is removed', () => {
    expect(removeRow(removeRow(draft, 0), 1).rows).toEqual([{ key: 2, description: '', category: 'damage', amount: '' }])
  })

  it('leaves out of what a renter would read a row publishing would refuse, such as a repeated description', () => {
    expect(draftEntries(appendRows(draft, [{ description: 'lost lock', category: 'loss', amount: '50' }]), 'EUR').map((entry) => entry.amountCents)).toEqual([3500, 4500])
  })

  it('gives the entries a renter would read, in cents, leaving out rows that are not yet a price', () => {
    const withBad = appendRows(draft, [{ description: 'Bent wheel', category: 'damage', amount: 'ninety' }])
    expect(draftEntries(withBad, 'EUR')).toEqual([{ description: 'Deep scratch', category: 'damage', amountCents: 3500 }, { description: 'Lost lock', category: 'loss', amountCents: 4500 }])
  })
})

// A block of cells copied from a spreadsheet and pasted onto the grid at the focused cell, as one change.
describe('pasting cells onto the grid', () => {
  const draft = { rows: [{ key: 0, description: 'Deep scratch', category: 'damage' as const, amount: '35' }, { key: 1, description: 'Lost lock', category: 'loss' as const, amount: '45' }], wearPolicy: 'Scuffs are wear.' }
  const rows = (pasted: ReturnType<typeof pasteAt>) => pasted.draft.rows.map((row) => [row.key, row.description, row.category, row.amount])

  it('reads lines pasted at a description as prices, writing over the rows from there and adding the rest', () => {
    const pasted = pasteAt(draft, { rowIndex: 1, column: 'description' }, [['Lost lock, steel', '50 €'], ['Bent wheel', 'Damage', '90']], 'EUR')
    expect(rows(pasted)).toEqual([[0, 'Deep scratch', 'damage', '35'], [1, 'Lost lock, steel', 'loss', '50'], [2, 'Bent wheel', 'damage', '90']])
    expect(pasted.count).toBe(2)
  })

  it('leaves out a header line pasted at a description, and takes a kind it names', () => {
    const pasted = pasteAt(draft, { rowIndex: 0, column: 'description' }, [['What', 'Kind', 'Price'], ['Cracked display', 'Verlust', '120,00']], 'EUR', { Verlust: 'loss' })
    expect(rows(pasted)).toEqual([[0, 'Cracked display', 'loss', '120.00'], [1, 'Lost lock', 'loss', '45']])
    expect(pasted.count).toBe(1)
  })

  it('writes a column pasted at the amount down from that row, cleaning what it can read and keeping what it cannot', () => {
    expect(rows(pasteAt(draft, { rowIndex: 0, column: 'amount' }, [['€40'], ['1.045,50'], ['ninety']], 'EUR'))).toEqual([[0, 'Deep scratch', 'damage', '40'], [1, 'Lost lock', 'loss', '1045.50'], [2, '', 'damage', 'ninety']])
  })

  it('writes a column pasted at the kind by its name, keeping a row’s kind when the name is not one', () => {
    expect(rows(pasteAt(draft, { rowIndex: 0, column: 'kind' }, [['Loss'], ['whatever']], 'EUR'))).toEqual([[0, 'Deep scratch', 'loss', '35'], [1, 'Lost lock', 'loss', '45']])
  })

  it('changes nothing for an empty paste', () => {
    expect(pasteAt(draft, { rowIndex: 0, column: 'description' }, [['']], 'EUR')).toEqual({ draft, count: 0 })
  })
})
