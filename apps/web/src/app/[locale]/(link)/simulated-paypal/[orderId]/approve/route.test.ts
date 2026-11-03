// @vitest-environment node
import { describe, expect, it } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 31).toString('base64')

const { POST } = await import('./route')
const { getServices } = await import('@/server/services')

async function feeOrder(): Promise<string> {
  const paypal = (await getServices()).simulatedPayPal
  const order = await paypal?.createFeeOrder({ amount: { cents: 80_00, currency: 'EUR' }, rentalReference: 'rental-1', description: 'Rental fee', brandName: 'Ribeira Bikes', returnUrl: 'http://localhost/r/token/paid', cancelUrl: 'http://localhost/r/token', idempotencyKey: crypto.randomUUID() })
  if (order === undefined || !order.ok) throw new Error('No order.')
  return order.value.orderId
}

const approve = (orderId: string, fields: Record<string, string>) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.append(name, value)
  return POST(new Request(`http://localhost/simulated-paypal/${orderId}/approve`, { method: 'POST', body }), { params: Promise.resolve({ orderId }) })
}

async function disputesAfterCapture(orderId: string): Promise<number> {
  const paypal = (await getServices()).simulatedPayPal
  await paypal?.captureFeeOrder({ orderId, idempotencyKey: crypto.randomUUID() })
  const open = await paypal?.listOpenDisputes()
  return open?.ok === true ? open.value.length : -1
}

describe('the simulated PayPal approval', () => {
  it('approves and sends the renter back; asked to, the renter disputes the payment once it is captured', async () => {
    const plain = await feeOrder()
    const answer = await approve(plain, {})
    expect(answer.status).toBe(303)
    expect(answer.headers.get('location')).toBe(`/r/token/paid?token=${plain}&PayerID=FAKEPAYER0001`)
    expect(await disputesAfterCapture(plain)).toBe(0)
    const disputed = await feeOrder()
    expect((await approve(disputed, { then: 'dispute' })).status).toBe(303)
    expect(await disputesAfterCapture(disputed)).toBe(1)
  })

  it('refuses anything else in the form', async () => {
    expect((await approve(await feeOrder(), { then: 'refund' })).status).toBe(400)
  })
})
