import { z } from 'zod'
import { sendSimulatedEvent } from '@/server/simulated-paypal-event'
import { getServices } from '@/server/services'

// The simulated PayPal finishing its review of a capture it held, in the test environment only: it completes or denies
// the capture, sends the shop's webhook the event PayPal would send about it, and sends the tester back to the order's
// own return path.
const review = z.strictObject({ outcome: z.enum(['completed', 'declined']) })

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const { orderId } = await params
  const { simulatedPayPal } = await getServices()
  const links = simulatedPayPal?.orderLinks(orderId)
  if (simulatedPayPal === undefined || links === undefined) return new Response(null, { status: 404 })
  const fields = review.safeParse(Object.fromEntries((await request.formData().catch(() => new FormData())).entries()))
  if (!fields.success) return new Response(null, { status: 400 })
  const captureId = simulatedPayPal.finishReview(orderId, fields.data.outcome)
  if (captureId === undefined) return new Response(null, { status: 409 })
  const eventType = fields.data.outcome === 'completed' ? 'PAYMENT.CAPTURE.COMPLETED' : 'PAYMENT.CAPTURE.DENIED'
  await sendSimulatedEvent(orderId, `WH-SIMULATED-REVIEW-${captureId}`, eventType, { id: captureId, status: fields.data.outcome === 'completed' ? 'COMPLETED' : 'DECLINED' })
  const back = `${new URL(links.returnUrl).pathname}?token=${encodeURIComponent(orderId)}&PayerID=FAKEPAYER0001`
  return new Response(null, { status: 303, headers: { Location: back } })
}
