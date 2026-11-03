import 'server-only'
import type { RateLimit } from '@hold/db'
import { SAMPLE_COMPARISON_RUNS_PER_DAY, SAMPLE_COMPARISON_RUNS_PER_NETWORK, utcDay } from '@hold/domain'
import { dailyAllowance } from '@/server/daily-shares'
import type { DailyAllowance, DailyShare } from '@/server/daily-shares'
import { callerNetwork } from '@/server/network'

const DAY = 24 * 60 * 60

// How many sample returns Claude may compare in a UTC day: from one network, and for every demo together
// (packages/domain demo-limits.ts).
export const SAMPLE_COMPARISON_LIMITS = {
  perNetwork: { name: 'sample-comparisons-network-day', max: SAMPLE_COMPARISON_RUNS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'sample-comparisons-day', max: SAMPLE_COMPARISON_RUNS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>

// The shares a comparison takes, in the order they are taken, each with the refusal that names it. Each demo has one
// sample return, so the return itself is the demo's share. Every subject carries the UTC day.
export function sampleComparisonShares(network: string, now: Date) {
  const day = utcDay(now)
  return [
    { share: 'network', limit: SAMPLE_COMPARISON_LIMITS.perNetwork, subject: `${network}\u0000${day}`, refusal: 'daily_cap_network' },
    { share: 'day', limit: SAMPLE_COMPARISON_LIMITS.perDay, subject: day, refusal: 'daily_cap' },
  ] as const satisfies readonly DailyShare<string>[]
}

// The network a comparison is counted against. A caller with no address counts as one unnamed network.
export async function sampleComparisonNetwork(): Promise<string> {
  return (await callerNetwork()) ?? 'unknown'
}

export type SampleComparisonAllowance = DailyAllowance<ReturnType<typeof sampleComparisonShares>[number]['refusal']>

// How many real comparisons on samples this network may still start today, and why none is left when none is.
export async function sampleComparisonAllowance(): Promise<SampleComparisonAllowance> {
  return dailyAllowance(sampleComparisonShares(await sampleComparisonNetwork(), new Date()))
}
