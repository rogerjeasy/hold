import { readCappedBody } from '@/server/capped-body'
import { receiveDemoPayPalEvent } from '@/server/demo-webhook'
import { PAYPAL_EVENT_MAX_BYTES } from '@/server/paypal-webhook'

// PayPal's deliveries for every demo shop, from the demo's one shared sandbox app. Under /api, which the language
// proxy leaves alone. The body is read only up to the limit.
export async function POST(request: Request): Promise<Response> {
  const body = await readCappedBody(request, PAYPAL_EVENT_MAX_BYTES)
  if (!body.ok) return new Response(null, { status: 413 })
  return receiveDemoPayPalEvent(body.text, request.headers)
}
