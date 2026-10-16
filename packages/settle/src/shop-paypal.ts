import { findPayPalAccount } from '@hold/db'
import type { Transaction } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import type { SettleDependencies } from './dependencies.ts'

// PayPal in the shop's own account, and the subscription its events are verified against.
export async function shopPayPal(
  dependencies: SettleDependencies,
  transaction: Transaction,
  shopId: string,
): Promise<{ readonly paypal: PayPalHolds; readonly webhookId: string | null; readonly accountId: string } | undefined> {
  const account = await findPayPalAccount(transaction, shopId, dependencies.paypalMode)
  return account === undefined ? undefined : { paypal: dependencies.paypalFor(account.credentialReference), webhookId: account.webhookId, accountId: account.id }
}
