import type { RateLimit } from '@hold/db'
import { SAMPLE_COMPARISON_RUNS_PER_DAY, SAMPLE_COMPARISON_RUNS_PER_NETWORK } from '@hold/domain'

const DAY = 24 * 60 * 60

// How many sample returns Claude may compare in a UTC day: from one network, and for every demo together
// (packages/domain demo-limits.ts).
export const SAMPLE_COMPARISON_LIMITS = {
  perNetwork: { name: 'sample-comparisons-network-day', max: SAMPLE_COMPARISON_RUNS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'sample-comparisons-day', max: SAMPLE_COMPARISON_RUNS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>
