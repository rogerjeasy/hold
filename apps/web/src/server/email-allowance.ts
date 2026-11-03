import 'server-only'
import { takeEmailAllowance } from '@hold/db'
import type { Transaction } from '@hold/db'

// Whether one more email someone asked for may go today (packages/domain EMAIL_LIMITS), counted in the transaction that
// sends it. A held email is logged with the shop and the rental, never the address, so an operator sees a visitor
// stopped without learning who they wrote to.
export async function mayEmail(transaction: Transaction, target: { readonly shopId: string; readonly rentalId: string | null; readonly to: string }): Promise<boolean> {
  const allowed = await takeEmailAllowance(transaction, target)
  if (!allowed) console.info(JSON.stringify({ event: 'email_held', shopId: target.shopId, rentalId: target.rentalId }))
  return allowed
}
