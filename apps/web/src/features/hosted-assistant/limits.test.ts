import { describe, expect, it } from 'vitest'
import { HOSTED_QUESTION_LIMITS } from './limits'

// One visitor must never take every judge's questions for the day.
describe('the hosted assistant’s limits', () => {
  it('give one network a day’s share well under the day’s cap for every network', () => {
    expect(HOSTED_QUESTION_LIMITS.perNetwork.windowSeconds).toBe(24 * 60 * 60)
    expect(HOSTED_QUESTION_LIMITS.perNetwork.max * 2).toBeLessThanOrEqual(HOSTED_QUESTION_LIMITS.perDay.max)
  })
})
