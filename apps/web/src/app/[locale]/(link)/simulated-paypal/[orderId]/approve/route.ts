import { getServices } from '@/server/services'

// The simulated PayPal's approval, in the test environment only: it approves the order and sends the renter back as
// PayPal does, with the order as `token`. Only to the order's own path, so it can send nobody elsewhere.
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const { orderId } = await params
  const paypal = (await getServices()).simulatedPayPal
  const links = paypal?.orderLinks(orderId)
  if (paypal === undefined || links === undefined) return new Response(null, { status: 404 })
  paypal.approveOrder(orderId)
  const back = `${new URL(links.returnUrl).pathname}?token=${encodeURIComponent(orderId)}&PayerID=FAKEPAYER0001`
  return new Response(null, { status: 303, headers: { Location: back } })
}
