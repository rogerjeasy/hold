import { describe, expect, it } from 'vitest'
import { comparisonNotice } from './comparison-notice.ts'

// What a comparison must say about itself before anyone reads its result (extensions.md section 3, rule 9).
describe('the notice above a comparison', () => {
  it('says nothing about a comparison of real photographs by the real model', () => {
    expect(comparisonNotice({ simulated: false, modelAnswered: true })).toBe('none')
  })

  it('says the photographs are demonstration samples when the real model compared them', () => {
    expect(comparisonNotice({ simulated: true, modelAnswered: true })).toBe('demonstration_photographs')
  })

  it('says the comparison is simulated when no model answered, as with seeded samples or the test stand-in', () => {
    expect(comparisonNotice({ simulated: true, modelAnswered: false })).toBe('simulated')
  })
})
