// @vitest-environment node
import { addDays } from '@hold/domain'
import { describe, expect, it } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 31).toString('base64')

const { POST } = await import('./route')
const { getServices } = await import('@/server/services')

async function holdOrder(): Promise<string> {
  const paypal = (await getServices()).simulatedPayPal
  const order = await paypal?.createHoldOrder({ amount: { cents: 300_00, currency: 'EUR' }, rentalReference: 'rental-1', description: 'Refundable hold', returnUrl: 'http://localhost/r/token/hold', cancelUrl: 'http://localhost/r/token', idempotencyKey: crypto.randomUUID() })
  if (order === undefined || !order.ok) throw new Error('No order.')
  return order.value.orderId
}

const approve = (orderId: string, fields: Record<string, string>) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.append(name, value)
  return POST(new Request(`http://localhost/simulated-paypal/${orderId}/approve`, { method: 'POST', body }), { params: Promise.resolve({ orderId }) })
}

async function placedAt(orderId: string): Promise<Date | undefined> {
  const placed = await (await getServices()).simulatedPayPal?.placeHold({ orderId, idempotencyKey: crypto.randomUUID() })
  return placed?.ok === true ? placed.value.createdAt : undefined
}

describe('the simulated PayPal approval', () => {
  it('approves now, or as if days ago when the tester asks, and sends the renter back', async () => {
    const now = await holdOrder()
    expect((await approve(now, {})).status).toBe(303)
    expect(Math.abs(((await placedAt(now))?.getTime() ?? 0) - Date.now())).toBeLessThan(60_000)
    const aged = await holdOrder()
    expect((await approve(aged, { placedDaysAgo: '27' })).headers.get('location')).toBe(`/r/token/hold?token=${aged}&PayerID=FAKEPAYER0001`)
    expect(Math.abs(((await placedAt(aged))?.getTime() ?? 0) - addDays(new Date(), -27).getTime())).toBeLessThan(60_000)
  })

  it('refuses an age it does not offer', async () => {
    expect((await approve(await holdOrder(), { placedDaysAgo: '40' })).status).toBe(400)
  })
})
