import type { RateLimit } from '@hold/db'
import { SAMPLE_ADVOCATE_RUNS_PER_DAY, SAMPLE_ADVOCATE_RUNS_PER_NETWORK } from '@hold/domain'

const DAY = 24 * 60 * 60

// How many samples may be handed to the advocates in a UTC day: by one network, and by every demo together
// (packages/domain demo-limits.ts).
export const SAMPLE_ADVOCATE_LIMITS = {
  perNetwork: { name: 'sample-advocates-network-day', max: SAMPLE_ADVOCATE_RUNS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'sample-advocates-day', max: SAMPLE_ADVOCATE_RUNS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>
