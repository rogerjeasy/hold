import { FAKE_SIGNATURE } from '@hold/paypal'
import { z } from 'zod'
import { SIMULATED_HOLD_AGE_DAYS } from '@/features/simulated-paypal/hold-age'
import { receivePayPalEvent } from '@/server/paypal-webhook'
import { getServices } from '@/server/services'

// The simulated PayPal's approval, in the test environment only. It approves the order, sends the shop's webhook the
// event PayPal would send, signed as the simulated PayPal signs, and sends the renter back as PayPal does, with the
// order as `token`. Only to the order's own path, so it can send nobody elsewhere. A tester may approve a hold as if
// days ago (features/simulated-paypal/hold-age.ts).
const approval = z.strictObject({ placedDaysAgo: z.literal(String(SIMULATED_HOLD_AGE_DAYS)).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const { orderId } = await params
  const { simulatedPayPal, simulatedWebhookFor } = await getServices()
  const links = simulatedPayPal?.orderLinks(orderId)
  if (simulatedPayPal === undefined || links === undefined) return new Response(null, { status: 404 })
  const fields = approval.safeParse(Object.fromEntries((await request.formData().catch(() => new FormData())).entries()))
  if (!fields.success) return new Response(null, { status: 400 })
  simulatedPayPal.approveOrder(orderId, { placedDaysAgo: fields.data.placedDaysAgo === undefined ? 0 : SIMULATED_HOLD_AGE_DAYS })
  const webhook = simulatedWebhookFor(orderId)
  if (webhook !== undefined) {
    const eventId = `WH-SIMULATED-${orderId}`
    const headers = new Headers({ 'paypal-transmission-id': eventId, 'paypal-transmission-time': new Date().toISOString(), 'paypal-transmission-sig': FAKE_SIGNATURE, 'paypal-cert-url': 'simulated', 'paypal-auth-algo': 'simulated' })
    await receivePayPalEvent(new URL(webhook).pathname.split('/').at(-1) ?? '', JSON.stringify({ id: eventId, event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: orderId, status: 'APPROVED' } }), headers)
  }
  const back = `${new URL(links.returnUrl).pathname}?token=${encodeURIComponent(orderId)}&PayerID=FAKEPAYER0001`
  return new Response(null, { status: 303, headers: { Location: back } })
}
