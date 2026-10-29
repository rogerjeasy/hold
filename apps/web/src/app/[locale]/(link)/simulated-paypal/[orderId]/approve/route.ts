import { z } from 'zod'
import { sendSimulatedEvent } from '@/server/simulated-paypal-event'
import { getServices } from '@/server/services'

// The simulated PayPal's approval, in the test environment only. It approves the order, sends the shop's webhook the
// event PayPal would send, and sends the renter back as PayPal does, with the order as `token`. Only to the order's own
// path, so it can send nobody elsewhere. A tester may approve a payment meaning to dispute it, so the morning queue has
// a PayPal dispute to show (extensions.md section 6), or have PayPal hold its capture for review or take another
// amount, so what Hold does then can be seen (architecture.md section 6.14).
const approval = z.strictObject({ then: z.enum(['dispute', 'review', 'other_amount']).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const { orderId } = await params
  const { simulatedPayPal } = await getServices()
  const links = simulatedPayPal?.orderLinks(orderId)
  if (simulatedPayPal === undefined || links === undefined) return new Response(null, { status: 404 })
  const fields = approval.safeParse(Object.fromEntries((await request.formData().catch(() => new FormData())).entries()))
  if (!fields.success) return new Response(null, { status: 400 })
  const then = fields.data.then
  simulatedPayPal.approveOrder(orderId, { thenDispute: then === 'dispute', capture: then === 'review' || then === 'other_amount' ? then : 'normal' })
  await sendSimulatedEvent(orderId, `WH-SIMULATED-${orderId}`, 'CHECKOUT.ORDER.APPROVED', { id: orderId, status: 'APPROVED' })
  const back = `${new URL(links.returnUrl).pathname}?token=${encodeURIComponent(orderId)}&PayerID=FAKEPAYER0001`
  return new Response(null, { status: 303, headers: { Location: back } })
}
