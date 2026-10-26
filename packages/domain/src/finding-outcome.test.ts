import { describe, expect, it } from 'vitest'
import { verdictForFinding } from './finding-outcome.ts'

// Every real decision is also a label (extensions.md section 5.7).
describe('what became of a finding once its rental closed', () => {
  it('was removed by staff when no claim line came from it', () => {
    expect(verdictForFinding({ line: null, contested: false, waived: false })).toBe('removed_by_staff')
  })

  it('was upheld when its line kept the published price', () => {
    expect(verdictForFinding({ line: { amountCents: 3500, publishedCents: 3500 }, contested: false, waived: false })).toBe('upheld')
  })

  it('was reduced when its line was charged below the published price', () => {
    expect(verdictForFinding({ line: { amountCents: 2000, publishedCents: 3500 }, contested: true, waived: false })).toBe('reduced')
  })

  it('was removed after the renter contested when the claim was then waived', () => {
    expect(verdictForFinding({ line: { amountCents: 3500, publishedCents: 3500 }, contested: true, waived: true })).toBe('removed_after_contest')
  })

  it('was removed by staff when staff waived a claim nobody contested', () => {
    expect(verdictForFinding({ line: { amountCents: 3500, publishedCents: 3500 }, contested: false, waived: true })).toBe('removed_by_staff')
  })
})
