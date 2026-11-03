import { EMAIL_LIMITS } from '@hold/domain'
import { takeRateTokenIn } from './rate-limit.ts'
import type { Transaction } from './scope.ts'

const DAY = 24 * 60 * 60

// One more email someone asked Hold to send today, within the day's limits for the rental, if there is one, the
// address, the shop and every shop together (architecture.md section 15). It counts inside the transaction that sends,
// so a refused or failed send spends nothing. The limiter keeps only a digest of each, so no address is stored with it.
export async function takeEmailAllowance(transaction: Transaction, target: { readonly shopId: string; readonly rentalId: string | null; readonly to: string }): Promise<boolean> {
  return (target.rentalId === null || (await takeRateTokenIn(transaction, { name: 'email-rental', max: EMAIL_LIMITS.perRentalPerDay, windowSeconds: DAY }, target.rentalId)))
    && (await takeRateTokenIn(transaction, { name: 'email-address', max: EMAIL_LIMITS.perAddressPerDay, windowSeconds: DAY }, target.to))
    && (await takeRateTokenIn(transaction, { name: 'email-shop', max: EMAIL_LIMITS.perShopPerDay, windowSeconds: DAY }, target.shopId))
    && (await takeRateTokenIn(transaction, { name: 'email-day', max: EMAIL_LIMITS.perDay, windowSeconds: DAY }, 'every shop'))
}
