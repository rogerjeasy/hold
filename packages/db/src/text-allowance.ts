import { TEXT_LIMITS } from '@hold/domain'
import { takeRateTokenIn } from './rate-limit.ts'
import type { Transaction } from './scope.ts'

const DAY = 24 * 60 * 60

// One more text to this rental's renter today, within the day's limits for the rental, the number and the shop
// (architecture.md section 12.3). It counts inside the transaction that sends the text, for the web app and the worker
// alike. The limiter keeps only a digest of each, so no number is stored with it.
export async function takeTextAllowance(transaction: Transaction, target: { readonly shopId: string; readonly rentalId: string; readonly phone: string }): Promise<boolean> {
  return (await takeRateTokenIn(transaction, { name: 'text-rental', max: TEXT_LIMITS.perRentalPerDay, windowSeconds: DAY }, target.rentalId))
    && (await takeRateTokenIn(transaction, { name: 'text-number', max: TEXT_LIMITS.perNumberPerDay, windowSeconds: DAY }, target.phone))
    && (await takeRateTokenIn(transaction, { name: 'text-shop', max: TEXT_LIMITS.perShopPerDay, windowSeconds: DAY }, target.shopId))
}
