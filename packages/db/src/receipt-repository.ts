import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { reserveEvidencePack } from './evidence-repository.ts'
import { auditLog, evidencePacks, moneyEvents, outbox, receiptDeliveries, rentals, renters } from './schema/index.ts'
import type { Transaction } from './scope.ts'

const receiptKind = z.enum(['capture', 'release', 'refund', 'invoice_sent', 'invoice_paid'])
const receiptKinds = { hold_captured: 'capture', hold_released: 'release', refunded: 'refund', invoice_sent: 'invoice_sent', invoice_paid: 'invoice_paid' } as const

// References are selected by the verified settlement path, never by a renter or an event's unverified body.
export async function queueSettlementReceipts(transaction: Transaction, rentalId: string, now: Date, references: readonly string[]) {
  if (references.length === 0) return []
  const events = await transaction.select().from(moneyEvents).where(and(eq(moneyEvents.rentalId, rentalId), inArray(moneyEvents.paypalReference, [...references]))).orderBy(asc(moneyEvents.recordedAt), asc(moneyEvents.id))
  const eligible = events.filter((event) => Object.hasOwn(receiptKinds, event.kind) && !event.paypalReference.endsWith(':remainder'))
  const pending = []
  for (const event of eligible) {
    const [existing] = await transaction.select({ id: receiptDeliveries.id }).from(receiptDeliveries).where(eq(receiptDeliveries.eventId, event.id))
    if (existing === undefined) pending.push(event)
  }
  if (pending.length === 0) return []
  const pack = await reserveEvidencePack(transaction, rentalId, now)
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId))
  if (pack === undefined || rental === undefined) return []
  const ids: string[] = []
  for (const event of pending) {
    const kind = receiptKind.parse(Reflect.get(receiptKinds, event.kind))
    const releasedCents = kind === 'release' ? event.amountCents : kind === 'capture' ? events.filter((each) => each.kind === 'hold_released' && each.paypalReference.endsWith(':remainder')).reduce((sum, each) => sum + each.amountCents, 0) : 0
    const [delivery] = await transaction.insert(receiptDeliveries).values({ shopId: rental.shopId, rentalId, packId: pack.id, eventId: event.id, renterId: rental.renterId, language: pack.snapshot.rental.language, kind, amountCents: event.amountCents, releasedCents, currency: event.currency, paypalReference: event.paypalReference, createdAt: now }).onConflictDoNothing().returning({ id: receiptDeliveries.id })
    if (delivery === undefined) continue
    ids.push(delivery.id)
    if (pack.state === 'ready') await transaction.insert(outbox).values({ shopId: rental.shopId, queue: 'messages', messageGroup: rentalId, payload: { receiptId: delivery.id }, createdAt: now })
  }
  return ids
}

export async function receiptDeliveriesFor(transaction: Transaction, rentalId: string) {
  return transaction.select({ id: receiptDeliveries.id, packId: receiptDeliveries.packId, kind: receiptDeliveries.kind, status: receiptDeliveries.status, amountCents: receiptDeliveries.amountCents, releasedCents: receiptDeliveries.releasedCents, createdAt: receiptDeliveries.createdAt, sentAt: receiptDeliveries.sentAt }).from(receiptDeliveries).where(eq(receiptDeliveries.rentalId, rentalId)).orderBy(asc(receiptDeliveries.createdAt), asc(receiptDeliveries.id))
}
export type ReceiptDeliverySummary = Awaited<ReturnType<typeof receiptDeliveriesFor>>[number]

export async function leaseReceipt(transaction: Transaction, receiptId: string, owner: string, now: Date) {
  const [delivery] = await transaction.update(receiptDeliveries).set({ status: 'sending', leaseOwner: owner, leaseUntil: new Date(now.getTime() + 5 * 60_000), attempts: sql`${receiptDeliveries.attempts} + 1`, lastError: null }).where(and(
    eq(receiptDeliveries.id, receiptId),
    or(eq(receiptDeliveries.status, 'queued'), eq(receiptDeliveries.status, 'failed'), and(eq(receiptDeliveries.status, 'sending'), or(isNull(receiptDeliveries.leaseUntil), lte(receiptDeliveries.leaseUntil, now)))),
    inArray(receiptDeliveries.packId, transaction.select({ id: evidencePacks.id }).from(evidencePacks).where(eq(evidencePacks.state, 'ready'))),
  )).returning()
  if (delivery === undefined) return undefined
  const [contact] = delivery.renterId === null ? [] : await transaction.select({ email: renters.email }).from(renters).where(eq(renters.id, delivery.renterId))
  return { ...delivery, kind: receiptKind.parse(delivery.kind), email: contact?.email ?? null }
}

export async function finishReceipt(transaction: Transaction, receiptId: string, owner: string, sent: boolean, now: Date, error: 'email_unavailable' | 'contact_missing' | null = null) {
  const [delivery] = await transaction.update(receiptDeliveries).set({ status: sent ? 'sent' : 'failed', sentAt: sent ? now : null, lastError: sent ? null : error ?? 'email_unavailable', leaseUntil: null, leaseOwner: null }).where(and(eq(receiptDeliveries.id, receiptId), eq(receiptDeliveries.status, 'sending'), eq(receiptDeliveries.leaseOwner, owner))).returning({ shopId: receiptDeliveries.shopId, rentalId: receiptDeliveries.rentalId })
  if (delivery === undefined) return false
  await transaction.insert(auditLog).values({ shopId: delivery.shopId, actorKind: 'worker', action: sent ? 'receipt.sent' : 'receipt.failed', subjectKind: 'rental', subjectId: delivery.rentalId, detail: { receiptId, error }, at: now })
  return true
}
