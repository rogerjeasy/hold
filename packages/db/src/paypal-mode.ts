import { desc, eq } from 'drizzle-orm'
import { paypalAccounts } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// Whether the shop's PayPal account is the sandbox or live. A shop with no account on record is treated as live: the
// stricter rule.
export async function shopPayPalMode(transaction: Transaction, shopId: string): Promise<'sandbox' | 'live'> {
  const [account] = await transaction.select({ mode: paypalAccounts.mode }).from(paypalAccounts).where(eq(paypalAccounts.shopId, shopId)).orderBy(desc(paypalAccounts.createdAt)).limit(1)
  return account?.mode === 'sandbox' ? 'sandbox' : 'live'
}
