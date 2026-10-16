import { receivePayPalEvent } from '@/server/paypal-webhook'

// PayPal's deliveries for one shop's account. Under /api, which the language proxy leaves alone.
export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  return receivePayPalEvent((await params).accountId, await request.text(), request.headers)
}
