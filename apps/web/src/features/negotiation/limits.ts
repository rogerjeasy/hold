import 'server-only'
import type { RateLimit } from '@hold/db'
import { SAMPLE_ADVOCATE_RUNS_PER_DAY, SAMPLE_ADVOCATE_RUNS_PER_NETWORK, SAMPLE_ADVOCATE_RUNS_PER_SHOP, utcDay } from '@hold/domain'
import { callerNetwork } from '@/server/network'
import { dailyAllowance } from '@/server/daily-shares'
import type { DailyAllowance, DailyShare } from '@/server/daily-shares'

const DAY = 24 * 60 * 60

// How many samples may be handed to the advocates in a UTC day: by one demo, by one network, and by every demo together
// (packages/domain demo-limits.ts).
export const SAMPLE_ADVOCATE_LIMITS = {
  perShop: { name: 'sample-advocates-shop-day', max: SAMPLE_ADVOCATE_RUNS_PER_SHOP, windowSeconds: DAY },
  perNetwork: { name: 'sample-advocates-network-day', max: SAMPLE_ADVOCATE_RUNS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'sample-advocates-day', max: SAMPLE_ADVOCATE_RUNS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>

export type SampleAdvocateShare = 'shop' | 'network' | 'day'

// The shares a run takes, in the order they are taken, each with the refusal that names it. Every subject carries the
// UTC day, so all three start again at midnight UTC, as the page says.
export function sampleAdvocateShares(shopId: string, network: string, now: Date) {
  const day = utcDay(now)
  return [
    { share: 'shop', limit: SAMPLE_ADVOCATE_LIMITS.perShop, subject: `${shopId}\u0000${day}`, refusal: 'daily_cap_shop' },
    { share: 'network', limit: SAMPLE_ADVOCATE_LIMITS.perNetwork, subject: `${network}\u0000${day}`, refusal: 'daily_cap_network' },
    { share: 'day', limit: SAMPLE_ADVOCATE_LIMITS.perDay, subject: day, refusal: 'daily_cap' },
  ] as const satisfies readonly (DailyShare<string> & { share: SampleAdvocateShare })[]
}

// The network a run is counted against. A caller with no address counts as one unnamed network.
export async function sampleAdvocateNetwork(): Promise<string> {
  return (await callerNetwork()) ?? 'unknown'
}

export type SampleAdvocatesAllowance = DailyAllowance<ReturnType<typeof sampleAdvocateShares>[number]['refusal']>

// How many live runs this demo may still start today, and why none is left when none is.
export async function sampleAdvocatesAllowance(shopId: string): Promise<SampleAdvocatesAllowance> {
  return dailyAllowance(sampleAdvocateShares(shopId, await sampleAdvocateNetwork(), new Date()))
}
