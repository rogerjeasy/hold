import 'server-only'
import { findPayPalAccount, inShop } from '@hold/db'
import type { CredentialStore } from '@hold/paypal'
import type { PayPalCheckout } from '@/features/renter/paypal-sdk'
import { getServices } from './services'

// The shop's PayPal app for PayPal's own button on a renter's page: its client ID, which PayPal publishes in every
// page that shows its button, and never its secret. Nothing where PayPal is simulated, or for a shop with no account,
// and the page then sends the renter to PayPal's own page as before.

export async function checkoutFrom(services: { readonly services: 'aws' | 'fake'; readonly store: CredentialStore }, reference: string | undefined): Promise<PayPalCheckout | undefined> {
  if (services.services === 'fake' || reference === undefined) return undefined
  const credentials = await services.store.read(reference).catch(() => undefined)
  return credentials === undefined ? undefined : { clientId: credentials.clientId, environment: 'sandbox' }
}

export async function paypalCheckout(shopId: string): Promise<PayPalCheckout | undefined> {
  const { config, database, paypalCredentials } = await getServices()
  const account = await inShop(database, { role: 'hold_app', shopId }, (transaction) => findPayPalAccount(transaction, shopId, config.paypalMode))
  return checkoutFrom({ services: config.services, store: paypalCredentials }, account?.credentialReference)
}
