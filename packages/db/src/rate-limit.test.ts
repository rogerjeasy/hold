import { utcDay } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { rateTokensLeft, takeRateToken } from './rate-limit.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase
beforeAll(async () => {
  database = await createTestDatabase()
})

// A daily cap across every network (architecture.md section 20.3) is the same limiter keyed by the day alone, so every
// caller, from any network, counts against one bucket, and the next day starts a new one.
describe('a daily cap', () => {
  const cap = { name: 'daily_cap_test', max: 3, windowSeconds: 24 * 60 * 60 }
  const today = utcDay(new Date('2026-12-01T09:00:00Z'))

  it('allows the day’s number and refuses the next, whoever asks', async () => {
    const taken = [await takeRateToken(database, cap, today), await takeRateToken(database, cap, today), await takeRateToken(database, cap, today)]

    expect(taken).toEqual([true, true, true])
    expect(await takeRateToken(database, cap, today)).toBe(false)
  })

  it('starts again on the next day', async () => {
    expect(await takeRateToken(database, cap, utcDay(new Date('2026-12-02T00:00:00Z')))).toBe(true)
  })

  it('is apart from every other limit', async () => {
    expect(await takeRateToken(database, { ...cap, name: 'another_daily_cap_test' }, today)).toBe(true)
  })
})

// What a screen shows before anyone asks: how many of a limit's tokens are left, read without spending one.
describe('the tokens left', () => {
  const limit = { name: 'tokens_left_test', max: 2, windowSeconds: 24 * 60 * 60 }

  it('are the whole limit before any is taken, and reading them takes none', async () => {
    expect(await rateTokensLeft(database, limit, 'fresh')).toBe(2)
    expect(await rateTokensLeft(database, limit, 'fresh')).toBe(2)
  })

  it('fall as tokens are taken and never go below none', async () => {
    await takeRateToken(database, limit, 'Spent')
    expect(await rateTokensLeft(database, limit, 'spent')).toBe(1)
    await takeRateToken(database, limit, 'spent')
    await takeRateToken(database, limit, 'spent')
    expect(await rateTokensLeft(database, limit, 'spent')).toBe(0)
  })

  it('are counted for each limit apart', async () => {
    expect(await rateTokensLeft(database, { ...limit, name: 'another_tokens_left_test' }, 'spent')).toBe(2)
  })

  it('are whole again once the window is over', async () => {
    const short = { name: 'short_window_test', max: 1, windowSeconds: 1 }
    await takeRateToken(database, short, 'later')
    expect(await rateTokensLeft(database, short, 'later')).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(await rateTokensLeft(database, short, 'later')).toBe(1)
  })
})
