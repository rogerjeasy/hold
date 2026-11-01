import { takeRateToken } from '@hold/db'
import { PAYPAL_RETURN_KINDS, paypalOrderId, paypalReturnLink } from '@hold/mobile-api'
import { z } from 'zod'
import { callerNetwork } from '@/server/network'
import { getServices } from '@/server/services'

// Where PayPal sends a renter who approved, or cancelled, a payment the phone app started (architecture.md section
// 13.8): straight on to the app, whose in-app browser session closes on that address. It reads and writes nothing and
// takes no token; the app then confirms the order it was given, and the server reads that order back from PayPal.
// The next address is always the app's own, so it can send nobody elsewhere. A public route, so it is rate limited.
const RETURNS = { name: 'paypal-return', max: 60, windowSeconds: 60 } as const

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const kind = z.enum(PAYPAL_RETURN_KINDS).safeParse((await params).kind)
  if (!kind.success) return new Response(null, { status: 404 })
  if (!(await takeRateToken((await getServices()).database, RETURNS, (await callerNetwork()) ?? 'local'))) return new Response(null, { status: 429 })
  const order = paypalOrderId.safeParse(new URL(request.url).searchParams.get('token'))
  return new Response(null, { status: 303, headers: { location: paypalReturnLink(kind.data, order.success ? order.data : null), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
}
