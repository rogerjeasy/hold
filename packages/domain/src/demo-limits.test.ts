import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CLAUDE_DAILY_TOKENS, DEMO_SESSION_DAYS, DEMO_STARTS_PER_DAY, demoRetirementCutoff, HOSTED_ASSISTANT_SHARE, hostedQuestionsPerDay, utcDay } from './demo-limits.ts'

describe('the demo’s daily caps', () => {
  it('counts a day as the calendar day in UTC, whatever the hour', () => {
    expect(utcDay(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12-01')
    expect(utcDay(new Date('2026-12-01T23:59:59.999Z'))).toBe('2026-12-01')
    expect(utcDay(new Date('2026-12-02T00:00:00Z'))).toBe('2026-12-02')
  })

  it('lets a day start at most a hundred demos, two accounts each, so a month stays under 10,000 active users', () => {
    expect(DEMO_STARTS_PER_DAY).toBe(100)
    expect(DEMO_STARTS_PER_DAY * 2 * 31).toBeLessThan(10_000)
  })

  it('sizes the hosted assistant’s questions so that a full day of them spends at most its share of Claude’s daily tokens', () => {
    expect(hostedQuestionsPerDay(30_000)).toBe(15)
    expect(hostedQuestionsPerDay(30_000) * 30_000).toBeLessThanOrEqual(CLAUDE_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE)
  })

  it('never lets the questions’ ceilings add up to more than the share, and always allows at least one', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: CLAUDE_DAILY_TOKENS }), (tokensPerQuestion) => {
        const questions = hostedQuestionsPerDay(tokensPerQuestion)
        expect(questions).toBeGreaterThanOrEqual(1)
        if (tokensPerQuestion <= CLAUDE_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE) expect(questions * tokensPerQuestion).toBeLessThanOrEqual(CLAUDE_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE)
      }),
    )
  })
})

describe('the age at which a demo is retired', () => {
  it('keeps a demo for seven days, so a judge can come back to it', () => {
    expect(DEMO_SESSION_DAYS).toBe(7)
  })

  it('retires demos opened more than seven days before now, to the millisecond', () => {
    const now = new Date('2026-12-08T03:00:00Z')
    const cutoff = demoRetirementCutoff(now)
    expect(cutoff.toISOString()).toBe('2026-12-01T03:00:00.000Z')
    // A demo opened exactly at the cutoff is retired on the next run, not this one.
    expect(new Date('2026-12-01T03:00:00Z') < cutoff).toBe(false)
    expect(new Date('2026-12-01T02:59:59.999Z') < cutoff).toBe(true)
  })
})
