import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CLAUDE_DAILY_TOKENS, DEMO_SESSION_DAYS, DEMO_STARTS_PER_DAY, demoRetirementCutoff, HOSTED_ASSISTANT_SHARE, HOSTED_QUESTIONS_PER_NETWORK, hostedQuestionsPerDay, INSIGHTS_TURNS_PER_DAY, INSIGHTS_TURNS_PER_NETWORK, INSIGHTS_TURNS_PER_SHOP, SAMPLE_ADVOCATE_RUN_TOKENS, SAMPLE_ADVOCATE_RUNS_PER_DAY, SAMPLE_ADVOCATE_RUNS_PER_NETWORK, SAMPLE_ADVOCATE_RUNS_PER_SHOP, SAMPLE_COMPARISON_RUNS_PER_DAY, SAMPLE_COMPARISON_RUNS_PER_NETWORK, SAMPLE_COMPARISON_TOKENS, utcDay } from './demo-limits.ts'

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

describe('each caller’s share of the day', () => {
  it('lets one network ask enough for one booking, and never the whole day’s questions', () => {
    expect(HOSTED_QUESTIONS_PER_NETWORK).toBeGreaterThanOrEqual(4)
    expect(HOSTED_QUESTIONS_PER_NETWORK * 2).toBeLessThanOrEqual(hostedQuestionsPerDay(30_000))
  })

  it('lets the advocates argue only a few samples a day, and the insights agent only a few dozen turns', () => {
    expect(SAMPLE_ADVOCATE_RUNS_PER_DAY).toBeLessThanOrEqual(4)
    expect(INSIGHTS_TURNS_PER_DAY).toBeLessThanOrEqual(60)
  })

  it('keeps a full day of sample runs, each at its ceiling, inside what the hosted assistant leaves of Claude’s day', () => {
    expect(SAMPLE_ADVOCATE_RUN_TOKENS).toBe(80_000)
    expect(SAMPLE_ADVOCATE_RUNS_PER_DAY * SAMPLE_ADVOCATE_RUN_TOKENS).toBeLessThanOrEqual(CLAUDE_DAILY_TOKENS * (1 - HOSTED_ASSISTANT_SHARE))
  })

  it('lets the sample comparisons spend at most a fifth of Claude’s day, and one network at most half of them', () => {
    expect(SAMPLE_COMPARISON_RUNS_PER_DAY * SAMPLE_COMPARISON_TOKENS).toBeLessThanOrEqual(CLAUDE_DAILY_TOKENS / 5)
    expect(SAMPLE_COMPARISON_RUNS_PER_NETWORK * 2).toBeLessThanOrEqual(SAMPLE_COMPARISON_RUNS_PER_DAY)
  })

  it('gives one network, and one shop, only a share of each day’s cap, so one visitor with many demos never takes it all', () => {
    expect(SAMPLE_ADVOCATE_RUNS_PER_SHOP).toBe(1)
    expect(SAMPLE_ADVOCATE_RUNS_PER_SHOP).toBeLessThan(SAMPLE_ADVOCATE_RUNS_PER_NETWORK)
    expect(SAMPLE_ADVOCATE_RUNS_PER_NETWORK).toBeLessThan(SAMPLE_ADVOCATE_RUNS_PER_DAY)
    expect(INSIGHTS_TURNS_PER_NETWORK * 2).toBeLessThanOrEqual(INSIGHTS_TURNS_PER_DAY)
    expect(INSIGHTS_TURNS_PER_SHOP).toBeLessThanOrEqual(INSIGHTS_TURNS_PER_NETWORK)
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
