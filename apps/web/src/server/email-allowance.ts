import 'server-only'
import { takeEmailAllowance } from '@hold/db'
import type { Transaction } from '@hold/db'
import { callerNetwork } from './network'

// Whether one more email someone asked for may go today (packages/domain EMAIL_LIMITS), counted in the transaction that
// sends it. essential: mail a renter needs to act on their own money, which no other tenant can ever stop. A held email
// is logged with the shop and the rental, never the address, so an operator sees a visitor stopped without learning
// who they wrote to.
export async function mayEmail(transaction: Transaction, target: { readonly shopId: string; readonly rentalId: string | null; readonly to: string; readonly essential: boolean }): Promise<boolean> {
  const allowed = await takeEmailAllowance(transaction, { ...target, network: (await callerNetwork()) ?? 'unknown' })
  if (!allowed) console.info(JSON.stringify({ event: 'email_held', shopId: target.shopId, rentalId: target.rentalId }))
  return allowed
}
