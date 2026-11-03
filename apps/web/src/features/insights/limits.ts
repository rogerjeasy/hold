import type { RateLimit } from '@hold/db'
import { INSIGHTS_TURNS_PER_DAY, INSIGHTS_TURNS_PER_NETWORK, INSIGHTS_TURNS_PER_SHOP } from '@hold/domain'

const DAY = 24 * 60 * 60

// How many insights turns may be taken in a day: by one shop, by one network, and by every shop together
// (packages/domain demo-limits.ts). A shop's and a network's day is the last 24 hours; every shop's is the UTC day.
export const INSIGHTS_LIMITS = {
  perShop: { name: 'insights-turns-shop-day', max: INSIGHTS_TURNS_PER_SHOP, windowSeconds: DAY },
  perNetwork: { name: 'insights-turns-network-day', max: INSIGHTS_TURNS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'insights-turns-day', max: INSIGHTS_TURNS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>
