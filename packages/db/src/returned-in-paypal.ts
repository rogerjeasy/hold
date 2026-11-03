import type { Money } from '@hold/domain'
import { and, eq, inArray } from 'drizzle-orm'
import { moneyEvents } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The kinds of line that record a capture Hold made, each under PayPal's capture id.
const CAPTURE_KINDS = ['hold_captured', 'fee_captured', 'extension_captured'] as const

export type ReturnedInPayPal = {
  // The capture PayPal returned money from, as PayPal's read-back names it.
  readonly captureId: string
  // What names this return in PayPal: the refund's id, or the capture's for a reversal. Unique in the money log, so a
  // refund Hold made itself, already recorded under its id, is never written again.
  readonly reference: string
  readonly amount: Money
  readonly occurredAt: Date
}

// Writes money PayPal returned to the renter without Hold onto the rental whose capture it came from (architecture.md
// section 8.7). Only a capture Hold made has a rental here; any other is not Hold's, and nothing is written. The caller
// has read the refund or the capture back from PayPal. Appends only, and once.
export async function recordReturnedInPayPal(transaction: Transaction, returned: ReturnedInPayPal): Promise<{ readonly rentalId: string } | undefined> {
  const [capture] = await transaction.select({ shopId: moneyEvents.shopId, rentalId: moneyEvents.rentalId, holdId: moneyEvents.holdId }).from(moneyEvents).where(and(eq(moneyEvents.paypalReference, returned.captureId), inArray(moneyEvents.kind, [...CAPTURE_KINDS])))
  if (capture === undefined) return undefined
  await transaction
    .insert(moneyEvents)
    .values({ shopId: capture.shopId, rentalId: capture.rentalId, holdId: capture.holdId, kind: 'refunded_in_paypal', currency: returned.amount.currency, amountCents: returned.amount.cents, paypalReference: returned.reference, occurredAt: returned.occurredAt })
    .onConflictDoNothing()
  return { rentalId: capture.rentalId }
}
