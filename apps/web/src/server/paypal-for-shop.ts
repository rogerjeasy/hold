import 'server-only'
import { findPayPalAccount } from '@hold/db'
import type { Transaction } from '@hold/db'
import type { PayPalHolds } from '@hold/paypal'
import { getServices } from './services'

// PayPal acting in this shop's own account, or nothing while the shop has not connected one.
export async function paypalForShop(transaction: Transaction, shopId: string): Promise<PayPalHolds | undefined> {
  const { config, paypalFor } = await getServices()
  const account = await findPayPalAccount(transaction, shopId, config.paypalMode)
  return account === undefined ? undefined : paypalFor(account.credentialReference)
}
