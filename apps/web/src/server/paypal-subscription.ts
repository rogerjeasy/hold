import 'server-only'
import { findPayPalAccount, saveWebhookId } from '@hold/db'
import type { Transaction } from '@hold/db'
import { PAYPAL_EVENT_TYPES } from '@hold/paypal'
import { DEMO_PAYPAL_REFERENCE, getServices } from './services'

// Subscribes the shop's own webhook address in its PayPal account, and keeps the subscription's id, which every event
// is verified against. PayPal takes only an HTTPS address, so on a developer's machine this says no and Hold works on
// without events. A demo shop shares the demo's one sandbox app, which PayPal allows ten addresses and sends every one of
// them each event, so it never subscribes its own (architecture.md section 20.3). True once subscribed.
export async function subscribeToPayPal(transaction: Transaction, shopId: string): Promise<boolean> {
  const { config, paypalFor } = await getServices()
  const account = await findPayPalAccount(transaction, shopId, config.paypalMode)
  if (account === undefined || account.credentialReference === DEMO_PAYPAL_REFERENCE) return false
  const subscribed = await paypalFor(account.credentialReference).createWebhook({ url: `${config.publicUrl}/api/webhooks/paypal/${account.id}`, eventTypes: PAYPAL_EVENT_TYPES })
  if (!subscribed.ok) return false
  await saveWebhookId(transaction, shopId, config.paypalMode, subscribed.value.webhookId)
  return true
}
