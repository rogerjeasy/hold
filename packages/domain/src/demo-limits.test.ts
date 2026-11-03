import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AGENT_DAILY_TOKENS, COMPARISON_DAILY_TOKENS, DEMO_SESSION_DAYS, DEMO_STARTS_PER_DAY, demoRetirementCutoff, HOSTED_ASSISTANT_SHARE, HOSTED_QUESTIONS_PER_NETWORK, hostedQuestionsPerDay, INSIGHTS_TURNS_PER_DAY, INSIGHTS_TURNS_PER_NETWORK, INSIGHTS_TURNS_PER_SHOP, SAMPLE_ADVOCATE_RUN_TOKENS, SAMPLE_ADVOCATE_RUNS_PER_DAY, SAMPLE_ADVOCATE_RUNS_PER_NETWORK, SAMPLE_ADVOCATE_RUNS_PER_SHOP, SAMPLE_COMPARISON_RUNS_PER_DAY, SAMPLE_COMPARISON_RUNS_PER_NETWORK, SAMPLE_COMPARISON_TOKENS, SAMPLE_INVESTIGATION_TOKENS, SAMPLE_INVESTIGATIONS_PER_DAY, SAMPLE_INVESTIGATIONS_PER_NETWORK, SAMPLE_INVESTIGATIONS_PER_SHOP, utcDay } from './demo-limits.ts'

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

  it('counts two days of Claude, one for each model, each under what Bedrock allows it', () => {
    // Opus 4.6 ran out at about 940,000 on 29 October 2026; Opus 4.5's day is listed at 6,750,000 (3 November 2026).
    expect(COMPARISON_DAILY_TOKENS).toBeLessThan(940_000)
    expect(AGENT_DAILY_TOKENS).toBeLessThan(6_750_000)
  })

  it('sizes the hosted assistant’s questions so that a full day of them spends at most its share of the agents’ daily tokens', () => {
    expect(hostedQuestionsPerDay(30_000)).toBe(100)
    expect(hostedQuestionsPerDay(30_000) * 30_000).toBeLessThanOrEqual(AGENT_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE)
  })

  it('never lets the questions’ ceilings add up to more than the share, and always allows at least one', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: AGENT_DAILY_TOKENS }), (tokensPerQuestion) => {
        const questions = hostedQuestionsPerDay(tokensPerQuestion)
        expect(questions).toBeGreaterThanOrEqual(1)
        if (tokensPerQuestion <= AGENT_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE) expect(questions * tokensPerQuestion).toBeLessThanOrEqual(AGENT_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE)
      }),
    )
  })
})

describe('each caller’s share of the day', () => {
  it('lets one network ask enough for one booking, and never the whole day’s questions', () => {
    expect(HOSTED_QUESTIONS_PER_NETWORK).toBeGreaterThanOrEqual(4)
    expect(HOSTED_QUESTIONS_PER_NETWORK * 2).toBeLessThanOrEqual(hostedQuestionsPerDay(30_000))
  })

  it('lets every judge of a day see the advocates live, and the insights agent take a few dozen turns', () => {
    expect(SAMPLE_ADVOCATE_RUNS_PER_DAY).toBeGreaterThanOrEqual(13)
    expect(INSIGHTS_TURNS_PER_DAY).toBeLessThanOrEqual(60)
  })

  it('keeps a full day of the agents’ sample runs, each at its ceiling, inside what the hosted assistant leaves of their day', () => {
    expect(SAMPLE_ADVOCATE_RUN_TOKENS).toBe(80_000)
    const samples = SAMPLE_ADVOCATE_RUNS_PER_DAY * SAMPLE_ADVOCATE_RUN_TOKENS + SAMPLE_INVESTIGATIONS_PER_DAY * SAMPLE_INVESTIGATION_TOKENS
    expect(samples).toBeLessThanOrEqual(AGENT_DAILY_TOKENS * (1 - HOSTED_ASSISTANT_SHARE))
  })

  it('lets the sample comparisons spend at most two thirds of the comparison model’s day, leaving the rest for real returns', () => {
    expect(SAMPLE_COMPARISON_RUNS_PER_DAY * SAMPLE_COMPARISON_TOKENS).toBeLessThanOrEqual((COMPARISON_DAILY_TOKENS * 2) / 3)
    expect(SAMPLE_COMPARISON_RUNS_PER_NETWORK * 2).toBeLessThanOrEqual(SAMPLE_COMPARISON_RUNS_PER_DAY)
  })

  it('gives one network, and one shop, only a share of each day’s cap, so one visitor with many demos never takes it all', () => {
    expect(SAMPLE_ADVOCATE_RUNS_PER_SHOP).toBe(2)
    expect(SAMPLE_ADVOCATE_RUNS_PER_SHOP).toBeLessThan(SAMPLE_ADVOCATE_RUNS_PER_NETWORK)
    expect(SAMPLE_INVESTIGATIONS_PER_SHOP).toBeLessThanOrEqual(SAMPLE_INVESTIGATIONS_PER_NETWORK)
    expect(SAMPLE_INVESTIGATIONS_PER_NETWORK * 2).toBeLessThanOrEqual(SAMPLE_INVESTIGATIONS_PER_DAY)
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
