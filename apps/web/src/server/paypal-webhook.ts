import 'server-only'
import { inShop, markOutboxSent, PAYPAL_EVENTS_QUEUE, recordPayPalEvent, takeRateToken } from '@hold/db'
import { z } from 'zod'
import { callerNetwork } from './network'
import { getServices } from './services'

// Where PayPal delivers a shop's events (architecture.md section 8.5). The exact body and its signing headers are
// stored first, with an outbox message, and PayPal is answered at once: PayPal retries anything else for three days.
// Nothing in the event is believed here. The worker verifies it with PayPal and reads back what it names.

export const PAYPAL_EVENT_MAX_BYTES = 64 * 1024
// PayPal's own delivery rate is far below this. It only stops a flood of made-up events filling the table.
const DELIVERIES = { name: 'paypal-webhook', max: 600, windowSeconds: 60 } as const

const eventSchema = z.object({
  id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  resource: z.object({ id: z.string().max(100).optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().max(100).optional() }).optional() }).optional() }).optional(),
})

const answer = (status: number) => new Response(null, { status })

export async function receivePayPalEvent(accountId: string, rawBody: string, headers: Headers): Promise<Response> {
  const { database, settle } = await getServices()
  if (!(await takeRateToken(database, DELIVERIES, (await callerNetwork()) ?? 'local'))) return answer(429)
  if (rawBody.length > PAYPAL_EVENT_MAX_BYTES) return answer(413)
  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(JSON.parse(rawBody))
  } catch {
    return answer(400)
  }
  // Only PayPal's own headers are kept: they are what its signature check needs.
  const signing = Object.fromEntries([...headers.entries()].filter(([name]) => name.startsWith('paypal-')))
  // Events about one order are handled in order: a capture is grouped with the order it was made on.
  const resourceId = parsed.resource?.supplementary_data?.related_ids?.order_id ?? parsed.resource?.id
  const recorded = await recordPayPalEvent(database, accountId, { eventId: parsed.id, type: parsed.event_type, resourceId, rawBody, headers: signing }, new Date())
  if (!recorded.ok) return answer(404)
  if (recorded.stored) {
    const { message } = recorded
    try {
      await settle.send({ queue: PAYPAL_EVENTS_QUEUE, group: message.group, deduplicationId: `event-${message.eventId}`, body: { shopId: message.shopId, eventId: message.eventId } })
      await inShop(database, { role: 'hold_app', shopId: message.shopId }, (transaction) => markOutboxSent(transaction, message.outboxId, new Date()))
    } catch {
      // Stored with its outbox message, so the relay hands it to the worker.
    }
  }
  return answer(200)
}
