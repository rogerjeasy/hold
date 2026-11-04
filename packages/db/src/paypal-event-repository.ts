import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { readJson } from './read-json.ts'
import { outbox, paypalAccounts, paypalEvents, rentals } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

// Events PayPal delivers (architecture.md section 8.5). The intake has PayPal verify each one before it is stored, with
// its exact body and headers and an outbox message. The worker verifies it again and reads back what it names.

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

export type DeliveryAccount = { readonly shopId: string; readonly webhookId: string | null; readonly credentialReference: string }

// The account a delivery's address names, read before any shop is chosen: its shop, the subscription PayPal signs for,
// and the credentials to ask PayPal with.
export async function deliveryAccount(database: Database, accountId: string): Promise<DeliveryAccount | undefined> {
  if (!UUID.test(accountId)) return undefined
  const [owner] = await outsideShop(database, (transaction) =>
    transaction.select({ shopId: sql<string>`account.shop_id` }).from(sql`hold_paypal_account(${accountId}::uuid) as account`),
  )
  if (owner === undefined) return undefined
  const { shopId } = owner
  const [account] = await inShop(database, { role: 'hold_app', shopId }, (transaction) =>
    transaction.select({ webhookId: paypalAccounts.webhookId, credentialReference: paypalAccounts.credentialReference }).from(paypalAccounts).where(eq(paypalAccounts.id, accountId)),
  )
  return account === undefined ? undefined : { shopId, ...account }
}

export async function recordPayPalEvent(database: Database, accountId: string, delivery: Delivery, now: Date): Promise<RecordResult> {
  const account = await deliveryAccount(database, accountId)
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

// The oldest messages waiting in every shop, read as the worker, the only role allowed to.
export async function pendingOutbox(database: Database, max: number): Promise<readonly OutboxMessage[]> {
  const rows = await outsideShop(
    database,
    (transaction) =>
      transaction
        .select({ id: sql<string>`message.id`, shopId: sql<string>`message.shop_id`, queue: sql<string>`message.queue`, messageGroup: sql<string>`message.message_group`, payload: sql<unknown>`message.payload` })
        .from(sql`hold_pending_outbox(${max}::integer) as message`),
    'hold_worker',
  )
  return rows.map((row) => ({ ...row, payload: readJson(payloadSchema, row.payload) }))
}

// The messages one change wrote, by the moment it ran, so the request that made them can send them at once. The
// relay sends any it could not.
export async function outboxWrittenAt(transaction: Transaction, at: Date): Promise<readonly OutboxMessage[]> {
  return transaction.select({ id: outbox.id, shopId: outbox.shopId, queue: outbox.queue, messageGroup: outbox.messageGroup, payload: outbox.payload })
    .from(outbox).where(and(eq(outbox.createdAt, at), eq(outbox.state, 'pending')))
}

export async function markOutboxSent(transaction: Transaction, messageId: string, now: Date): Promise<void> {
  await transaction.update(outbox).set({ state: 'sent', sentAt: now }).where(and(eq(outbox.id, messageId), eq(outbox.state, 'pending')))
}
