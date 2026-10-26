import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { outbox, paypalEvents, rentals } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

// Events PayPal delivers (architecture.md section 8.5). Each is stored first, with its exact body and headers and an
// outbox message, before anything in it is believed. The worker verifies it with PayPal and reads back what it names.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PAYPAL_EVENTS_QUEUE = 'paypal-events'

export type Delivery = {
  readonly eventId: string
  readonly type: string
  // The PayPal resource the event names, such as an order. Events about one resource are handled in order.
  readonly resourceId: string | undefined
  readonly rawBody: string
  readonly headers: Readonly<Record<string, string>>
}

// A new event, with what its outbox message carries, so the intake can also send it at once.
export type StoredEvent = { readonly shopId: string; readonly eventId: string; readonly group: string; readonly outboxId: string }

export type RecordResult =
  | { readonly ok: true; readonly stored: true; readonly message: StoredEvent }
  | { readonly ok: true; readonly stored: false }
  | { readonly ok: false; readonly reason: 'unknown_account' }

export async function recordPayPalEvent(database: Database, accountId: string, delivery: Delivery, now: Date): Promise<RecordResult> {
  if (!UUID.test(accountId)) return { ok: false, reason: 'unknown_account' }
  const [account] = await outsideShop(database, (transaction) =>
    transaction.select({ shopId: sql<string>`account.shop_id` }).from(sql`hold_paypal_account(${accountId}::uuid) as account`),
  )
  if (account === undefined) return { ok: false, reason: 'unknown_account' }
  const { shopId } = account
  return inShop(database, { role: 'hold_app', shopId }, async (transaction): Promise<RecordResult> => {
    const [stored] = await transaction
      .insert(paypalEvents)
      .values({ shopId, paypalAccountId: accountId, paypalEventId: delivery.eventId, type: delivery.type, rawBody: delivery.rawBody, headers: delivery.headers, receivedAt: now })
      // PayPal sends an event again until it hears back. The second copy changes nothing.
      .onConflictDoNothing()
      .returning({ id: paypalEvents.id })
    if (stored === undefined) return { ok: true, stored: false }
    const group = delivery.resourceId ?? delivery.eventId
    const [message] = await transaction
      .insert(outbox)
      .values({ shopId, queue: PAYPAL_EVENTS_QUEUE, messageGroup: group, payload: { eventId: stored.id, paypalEventId: delivery.eventId }, createdAt: now })
      .returning({ id: outbox.id })
    if (message === undefined) throw new Error('The outbox message was not written.')
    return { ok: true, stored: true, message: { shopId, eventId: stored.id, group, outboxId: message.id } }
  })
}

export async function payPalEvent(transaction: Transaction, eventId: string) {
  if (!UUID.test(eventId)) return undefined
  const [event] = await transaction.select().from(paypalEvents).where(eq(paypalEvents.id, eventId))
  return event
}

export async function markPayPalEvent(
  transaction: Transaction,
  eventId: string,
  marks: { readonly verification: 'verified' | 'rejected' | 'simulated'; readonly processing: 'applied' | 'ignored' | 'failed'; readonly rentalId: string | null },
): Promise<void> {
  await transaction.update(paypalEvents).set(marks).where(eq(paypalEvents.id, eventId))
}

// The rental a fee order belongs to, if any.
export async function feeRentalByOrder(transaction: Transaction, orderId: string): Promise<string | undefined> {
  const [rental] = await transaction.select({ id: rentals.id }).from(rentals).where(eq(rentals.paypalFeeOrderId, orderId))
  return rental?.id
}

export type OutboxMessage = { readonly id: string; readonly shopId: string; readonly queue: string; readonly messageGroup: string; readonly payload: Readonly<Record<string, unknown>> }

const payloadSchema = z.record(z.string(), z.unknown())

// The oldest messages waiting in every shop, read as the worker, the only role allowed to. Aurora sends the jsonb
// payload of a raw query as text, and the in-memory database as an object, so both are read the same way here.
export async function pendingOutbox(database: Database, max: number): Promise<readonly OutboxMessage[]> {
  const rows = await outsideShop(
    database,
    (transaction) =>
      transaction
        .select({ id: sql<string>`message.id`, shopId: sql<string>`message.shop_id`, queue: sql<string>`message.queue`, messageGroup: sql<string>`message.message_group`, payload: sql<unknown>`message.payload` })
        .from(sql`hold_pending_outbox(${max}::integer) as message`),
    'hold_worker',
  )
  return rows.map((row) => ({ ...row, payload: payloadSchema.parse(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) }))
}

export async function markOutboxSent(transaction: Transaction, messageId: string, now: Date): Promise<void> {
  await transaction.update(outbox).set({ state: 'sent', sentAt: now }).where(and(eq(outbox.id, messageId), eq(outbox.state, 'pending')))
}
