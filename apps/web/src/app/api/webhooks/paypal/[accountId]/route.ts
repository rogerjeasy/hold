import { readCappedBody } from '@/server/capped-body'
import { PAYPAL_EVENT_MAX_BYTES, receivePayPalEvent } from '@/server/paypal-webhook'

// PayPal's deliveries for one shop's account. Under /api, which the language proxy leaves alone. The body is read only
// up to the limit, so an oversized delivery is never held in memory.
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const body = await readCappedBody(request, PAYPAL_EVENT_MAX_BYTES)
  if (!body.ok) return new Response(null, { status: 413 })
  return receivePayPalEvent((await params).accountId, body.text, request.headers)
}
