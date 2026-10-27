import { FAKE_SIGNATURE } from '@hold/paypal'
import { receivePayPalEvent } from '@/server/paypal-webhook'
import { getServices } from '@/server/services'

// The simulated PayPal's approval, in the test environment only. It approves the order, sends the shop's webhook the
// event PayPal would send, signed as the simulated PayPal signs, and sends the renter back as PayPal does, with the
// order as `token`. Only to the order's own path, so it can send nobody elsewhere.
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const { orderId } = await params
  const { simulatedPayPal, simulatedWebhookFor } = await getServices()
  const links = simulatedPayPal?.orderLinks(orderId)
  if (simulatedPayPal === undefined || links === undefined) return new Response(null, { status: 404 })
  simulatedPayPal.approveOrder(orderId)
  const webhook = simulatedWebhookFor(orderId)
  if (webhook !== undefined) {
    const eventId = `WH-SIMULATED-${orderId}`
    const headers = new Headers({ 'paypal-transmission-id': eventId, 'paypal-transmission-time': new Date().toISOString(), 'paypal-transmission-sig': FAKE_SIGNATURE, 'paypal-cert-url': 'simulated', 'paypal-auth-algo': 'simulated' })
    await receivePayPalEvent(new URL(webhook).pathname.split('/').at(-1) ?? '', JSON.stringify({ id: eventId, event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: orderId, status: 'APPROVED' } }), headers)
  }
  const back = `${new URL(links.returnUrl).pathname}?token=${encodeURIComponent(orderId)}&PayerID=FAKEPAYER0001`
  return new Response(null, { status: 303, headers: { Location: back } })
}
