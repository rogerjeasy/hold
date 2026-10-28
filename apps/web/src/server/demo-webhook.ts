import 'server-only'
import { demoAccountForRental, takeRateToken } from '@hold/db'
import { z } from 'zod'
import { callerNetwork } from './network'
import { PAYPAL_EVENT_MAX_BYTES, receivePayPalEvent } from './paypal-webhook'
import { getServices } from './services'

// Where the demo's shared PayPal sandbox app delivers the events of every demo shop (architecture.md section 20.3).
// Each event names its rental in the custom_id Hold set on the order, which PayPal repeats on the order, the
// authorization and the capture. That rental's demo shop takes it from there exactly as a shop's own address would:
// stored, verified with PayPal against the shared webhook, and applied only after what it names is read back. An event
// that names no demo shop's rental is answered and dropped, so this address reaches no real shop.

const DELIVERIES = { name: 'paypal-demo-webhook', max: 600, windowSeconds: 60 } as const

const customIdOf = z.object({
  resource: z
    .object({
      custom_id: z.string().max(127).optional(),
      purchase_units: z.array(z.object({ custom_id: z.string().max(127).optional() })).optional(),
    })
    .optional(),
})

const answer = (status: number) => new Response(null, { status })

export async function receiveDemoPayPalEvent(rawBody: string, headers: Headers): Promise<Response> {
  const { database, config } = await getServices()
  if (!(await takeRateToken(database, DELIVERIES, (await callerNetwork()) ?? 'local'))) return answer(429)
  if (rawBody.length > PAYPAL_EVENT_MAX_BYTES) return answer(413)
  let resource: z.infer<typeof customIdOf>['resource']
  try {
    resource = customIdOf.parse(JSON.parse(rawBody)).resource
  } catch {
    return answer(400)
  }
  const rentalId = resource?.custom_id ?? resource?.purchase_units?.[0]?.custom_id
  const accountId = rentalId === undefined ? undefined : await demoAccountForRental(database, rentalId, config.paypalMode)
  return accountId === undefined ? answer(200) : receivePayPalEvent(accountId, rawBody, headers)
}
