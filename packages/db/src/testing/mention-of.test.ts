import { describe, expect, it } from 'vitest'
import { mentionOf } from './mention-of.ts'

describe('what one side must never read', () => {
  const limit = mentionOf(['highestTotal'], [5000])

  it('finds a field name, or an amount as a number of its own', () => {
    expect(JSON.stringify({ highestTotalCents: 1 })).toMatch(limit)
    expect(JSON.stringify({ cents: 5000 })).toMatch(limit)
    expect(JSON.stringify([5000])).toMatch(limit)
  })

  it('does not take the same digits inside a fingerprint or an id for the amount', () => {
    // The fingerprint a CI run read on 5 November 2026, which failed the test it guarded.
    expect(JSON.stringify({ fingerprint: 'f9fce332a0563c893fc91045000cf6c269c3fb6b34a8c99960efa934d9a1ac18' })).not.toMatch(limit)
    expect(JSON.stringify({ id: 'd32d7d38-5000-492d-be87-0c880151380e' })).not.toMatch(limit)
    expect(JSON.stringify({ cents: 15000 })).not.toMatch(limit)
  })
})
