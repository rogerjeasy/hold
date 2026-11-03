import type { Money } from '@hold/domain'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { executions, moneyEvents } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The kinds of line that record a capture Hold made, each under PayPal's capture id, and the kind of line money
// PayPal returned from each is written as: money back from the hold's capture counts against a claim; money back from
// the rental's fee or extra days does not.
const RETURNED_AS = { hold_captured: 'refunded_in_paypal', fee_captured: 'fee_refunded_in_paypal', extension_captured: 'fee_refunded_in_paypal' } as const
const CAPTURE_KINDS = Object.keys(RETURNED_AS) as (keyof typeof RETURNED_AS)[]

export type ReturnedInPayPal = {
  // The capture PayPal returned money from, as PayPal's read-back names it.
  readonly captureId: string
  // What names this return in PayPal: the refund's id, or the capture's for a reversal. Unique in the money log, so a
  // refund Hold made itself, already recorded under its id, is never written again.
  readonly reference: string
  // A refund's amount as PayPal reads it, or, for a reversal, whatever of the capture was not already returned.
  readonly amount: Money | 'rest_of_capture'
  readonly occurredAt: Date
}

// Holds every other transaction that would record money back from this capture until this one ends, so two cannot
// both count the same remainder: money PayPal returned, here, and Hold's own refund (confirmClaimRefund). A lock on a
// money log row would need the right to update it, which no role has, so it is an advisory lock named by the capture.
export async function lockCapture(transaction: Transaction, captureId: string): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`money-returned:${captureId}`}))`)
}

// What has already gone back from a capture: every line that names it, and a refund Hold made before lines named their
// capture (migration 0047), which can only have come from the rental's one hold capture.
async function returnedFrom(transaction: Transaction, capture: { readonly paypalReference: string; readonly rentalId: string; readonly kind: string }): Promise<number> {
  const total = async (where: ReturnType<typeof and>) => (await transaction.select({ cents: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`.mapWith(Number) }).from(moneyEvents).where(where))[0]?.cents ?? 0
  const named = await total(eq(moneyEvents.returnedFrom, capture.paypalReference))
  if (capture.kind !== 'hold_captured') return named
  const holdCaptures = await transaction.select({ id: moneyEvents.id }).from(moneyEvents).where(and(eq(moneyEvents.rentalId, capture.rentalId), eq(moneyEvents.kind, 'hold_captured')))
  return holdCaptures.length === 1 ? named + await total(and(eq(moneyEvents.rentalId, capture.rentalId), eq(moneyEvents.kind, 'refunded'), isNull(moneyEvents.returnedFrom))) : named
}

// Whether the money log already holds this PayPal reference, under any kind.
export async function isRecorded(transaction: Transaction, reference: string): Promise<boolean> {
  return (await transaction.select({ id: moneyEvents.id }).from(moneyEvents).where(eq(moneyEvents.paypalReference, reference))).length > 0
}

// Writes money PayPal returned to the renter without Hold onto the rental whose capture it came from (architecture.md
// section 8.7). Only a capture Hold made has a rental here; any other is not Hold's, and nothing is written. The caller
// has read the refund or the capture back from PayPal. Appends only, and once; never more than is left of the capture.
export async function recordReturnedInPayPal(transaction: Transaction, returned: ReturnedInPayPal): Promise<{ readonly rentalId: string } | undefined> {
  await lockCapture(transaction, returned.captureId)
  const [capture] = await transaction.select().from(moneyEvents).where(and(eq(moneyEvents.paypalReference, returned.captureId), inArray(moneyEvents.kind, CAPTURE_KINDS)))
  if (capture === undefined || !(capture.kind in RETURNED_AS)) return undefined
  const left = capture.amountCents - await returnedFrom(transaction, capture)
  const amount = returned.amount === 'rest_of_capture' ? { cents: left, currency: capture.currency } : returned.amount
  if (amount.cents <= 0 || amount.cents > left) return { rentalId: capture.rentalId }
  await transaction
    .insert(moneyEvents)
    .values({ shopId: capture.shopId, rentalId: capture.rentalId, holdId: capture.holdId, kind: RETURNED_AS[capture.kind as keyof typeof RETURNED_AS], currency: amount.currency, amountCents: amount.cents, paypalReference: returned.reference, returnedFrom: returned.captureId, occurredAt: returned.occurredAt })
    .onConflictDoNothing()
  return { rentalId: capture.rentalId }
}

// Every refund Hold itself asked PayPal for on a capture, whatever has become of it, with the refund's id once PayPal
// gave it. A refund PayPal reports on that capture may be one of these, even before Hold knows its id.
export async function holdRefundsOfCapture(transaction: Transaction, captureId: string): Promise<readonly { readonly id: string; readonly state: string; readonly refundId: string | null }[]> {
  const rows = await transaction.select({ id: executions.id, state: executions.state, resources: executions.paypalResourceIds }).from(executions).where(and(eq(executions.action, 'refund'), sql`${executions.paypalResourceIds} ->> 'capture' = ${captureId}`))
  return rows.map((row) => ({ id: row.id, state: row.state, refundId: row.resources['refund'] ?? null }))
}
