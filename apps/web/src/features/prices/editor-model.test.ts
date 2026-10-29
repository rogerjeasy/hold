import { describe, expect, it } from 'vitest'
import { appendRows, draftEntries, emptyDraft, moveRow, removeRow, updateRow } from './editor-model'

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
