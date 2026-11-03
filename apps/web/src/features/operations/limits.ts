import type { RateLimit } from '@hold/db'
import { SAMPLE_INVESTIGATIONS_PER_DAY, SAMPLE_INVESTIGATIONS_PER_NETWORK, SAMPLE_INVESTIGATIONS_PER_SHOP } from '@hold/domain'

const DAY = 24 * 60 * 60

// How often the operations agent may be asked to investigate a demo's samples: by one shop, by one network, and by
// every demo together (packages/domain demo-limits.ts).
export const SAMPLE_INVESTIGATION_LIMITS = {
  perShop: { name: 'sample-investigation-shop-day', max: SAMPLE_INVESTIGATIONS_PER_SHOP, windowSeconds: DAY },
  perNetwork: { name: 'sample-investigation-network-day', max: SAMPLE_INVESTIGATIONS_PER_NETWORK, windowSeconds: DAY },
  perDay: { name: 'sample-investigation-day', max: SAMPLE_INVESTIGATIONS_PER_DAY, windowSeconds: DAY },
} as const satisfies Record<string, RateLimit>
