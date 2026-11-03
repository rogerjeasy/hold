import type { RateLimit } from '@hold/db'
import { INSIGHTS_TURNS_PER_DAY } from '@hold/domain'

// How many insights turns every shop together may take in a UTC day (packages/domain demo-limits.ts).
export const INSIGHTS_DAY = { name: 'insights-turns-day', max: INSIGHTS_TURNS_PER_DAY, windowSeconds: 24 * 60 * 60 } as const satisfies RateLimit
