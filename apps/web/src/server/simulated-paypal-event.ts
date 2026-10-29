import 'server-only'
import { FAKE_SIGNATURE } from '@hold/paypal'
import { receivePayPalEvent } from './paypal-webhook'
import { getServices } from './services'

// Sends the shop's webhook the event PayPal would send about an order, signed as the simulated PayPal signs. The test
// environment only: elsewhere there is no simulated PayPal, and nothing is sent.
export async function sendSimulatedEvent(orderId: string, eventId: string, eventType: string, resource: Readonly<Record<string, unknown>>): Promise<void> {
  const webhook = (await getServices()).simulatedWebhookFor(orderId)
  if (webhook === undefined) return
  const headers = new Headers({ 'paypal-transmission-id': eventId, 'paypal-transmission-time': new Date().toISOString(), 'paypal-transmission-sig': FAKE_SIGNATURE, 'paypal-cert-url': 'simulated', 'paypal-auth-algo': 'simulated' })
  await receivePayPalEvent(new URL(webhook).pathname.split('/').at(-1) ?? '', JSON.stringify({ id: eventId, event_type: eventType, resource }), headers)
}
