import 'server-only'
import { deliveryAccount, inShop, markOutboxSent, PAYPAL_EVENTS_QUEUE, recordPayPalEvent, returnRateToken, takeRateToken } from '@hold/db'
import { TRANSIENT, verifyPayPalDelivery } from '@hold/settle'
import { z } from 'zod'
import { callerNetwork } from './network'
import { getServices } from './services'

// Where PayPal delivers a shop's events (architecture.md section 8.5). PayPal is asked first whether it signed the exact
// body for this account's subscription, and only then is the event stored, with its signing headers and an outbox
// message, and PayPal answered. So a forged post is never stored, cannot take a real event's id first, and costs no
// queue or worker. Nothing in the event is believed here: the worker verifies it again and reads back what it names.

export const PAYPAL_EVENT_MAX_BYTES = 64 * 1024
// PayPal's own delivery rate is far below this. It only stops a flood of made-up posts from one network.
const DELIVERIES = { name: 'paypal-webhook', max: 600, windowSeconds: 60 } as const
// Each forged post costs one call to PayPal. Past this many in an hour from one network to one address, that network's
// posts there are refused unchecked. Counted per network, so forgeries never block PayPal's own deliveries, which come
// from PayPal's networks; a forger cannot post from those. A token is taken before the check, so posts in flight
// together cannot overrun the count, and given back only once PayPal says it signed the post, so PayPal's own
// deliveries never count. A check PayPal could not answer keeps its token: the cost was spent either way.
export const FORGED_DELIVERIES = { name: 'paypal-webhook-forged', max: 30, windowSeconds: 3600 } as const
// The same, for one address across every network, so a sender with many networks cannot drive checks without end.
// Ten networks' worth: far above what any shop's own deliveries could reach, and they are given back. A sender spread
// widely enough can still reach it, and then PayPal's own deliveries wait with the rest (architecture.md section 15.1).
export const ACCOUNT_VERIFICATIONS = { name: 'paypal-webhook-forged-account', max: 10 * FORGED_DELIVERIES.max, windowSeconds: 3600 } as const

export const forgedDeliverySubject = (accountId: string, network: string) => `${accountId}:${network}`

const eventSchema = z.object({
  id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  resource: z.object({ id: z.string().max(100).optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().max(100).optional() }).optional() }).optional() }).optional(),
})

const answer = (status: number) => new Response(null, { status })

export async function receivePayPalEvent(accountId: string, rawBody: string, headers: Headers): Promise<Response> {
  const { database, settle, paypalFor } = await getServices()
  const network = (await callerNetwork()) ?? 'local'
  if (!(await takeRateToken(database, DELIVERIES, network))) return answer(429)
  if (rawBody.length > PAYPAL_EVENT_MAX_BYTES) return answer(413)
  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(JSON.parse(rawBody))
  } catch {
    return answer(400)
  }
  const account = await deliveryAccount(database, accountId)
  if (account === undefined) return answer(404)
  const forger = forgedDeliverySubject(accountId, network)
  if (!(await takeRateToken(database, FORGED_DELIVERIES, forger))) return answer(429)
  if (!(await takeRateToken(database, ACCOUNT_VERIFICATIONS, accountId))) {
    // No check was made, so this network spent nothing.
    await returnRateToken(database, FORGED_DELIVERIES, forger)
    return answer(429)
  }
  // Only PayPal's own headers are kept: they are what its signature check needs.
  const signing = Object.fromEntries([...headers.entries()].filter(([name]) => name.startsWith('paypal-')))
  const verified = account.webhookId === null ? undefined : await verifyPayPalDelivery(paypalFor(account.credentialReference), account.webhookId, rawBody, signing)
  // PayPal could not be reached, or answered nothing readable. Not 2xx, so PayPal sends the event again.
  if (verified !== undefined && !verified.ok && TRANSIENT.has(verified.error.kind)) return answer(503)
  // Refused, or a check PayPal itself refused as a bad request. Not 2xx, so a real event refused by mistake comes again.
  if (verified === undefined || !verified.ok || verified.value === 'rejected') return answer(401)
  await returnRateToken(database, FORGED_DELIVERIES, forger)
  await returnRateToken(database, ACCOUNT_VERIFICATIONS, accountId)
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
