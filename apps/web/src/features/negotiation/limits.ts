import type { RateLimit } from '@hold/db'
import { SAMPLE_ADVOCATE_RUNS_PER_DAY } from '@hold/domain'

// How many samples every demo together may hand to the advocates in a UTC day (packages/domain demo-limits.ts).
export const SAMPLE_ADVOCATE_LIMIT = { name: 'sample-advocates-day', max: SAMPLE_ADVOCATE_RUNS_PER_DAY, windowSeconds: 24 * 60 * 60 } as const satisfies RateLimit
