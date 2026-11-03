import type { MoneyEventKind } from '@hold/domain'
import { and, eq, inArray, like, or } from 'drizzle-orm'
import type { LedgerEvent } from './money-ledger-records.ts'
import { eventResourceId, resourceOf } from './paypal-resources.ts'
import { authorizations, executions, holds, invoices, moneyEvents, paypalEvents, rentals } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The PayPal record on a rental's page (architecture.md section 11.9): what PayPal confirmed for the rental, from the
// money log, each with the call that asked for it and the verified event about it; and the calls PayPal has not
// confirmed yet. Plain rows, worded on the screen. Nothing here is a PayPal event's body or Hold's own reference.

type Action = typeof executions.$inferSelect.action
type CallState = typeof executions.$inferSelect.state
type AuthorizationState = typeof authorizations.$inferSelect.state

// PayPal's own ids for a call, under the names PayPal gives them. A call to invoice keeps Hold's own invoice record
// under "invoice", so PayPal's invoice id comes only from the money log.
const CALL_IDS = ['order', 'authorization', 'capture', 'refund'] as const
type PayPalIds = Partial<Record<(typeof CALL_IDS)[number] | 'invoice', string>>

export type PayPalRecordLine = {
  // What PayPal confirmed, as the money log names it; null for a call it has not confirmed yet.
  readonly kind: MoneyEventKind | null
  // The call Hold made, when the line came from one.
  readonly action: Action | null
  readonly currency: string
  readonly amountCents: number
  readonly ids: PayPalIds
  // The status PayPal reported on the read-back that wrote the line.
  readonly paypalStatus: string | null
  // Whether a capture from the hold released the rest of it: true for a damage charge, false for a walk-in's fee.
  readonly finalCapture: boolean | null
  // Sent as PayPal-Request-Id, so a retry can never act twice.
  readonly requestId: string | null
  readonly callState: CallState | null
  // When PayPal says it happened, or when the call was made.
  readonly at: Date
  // When Hold wrote the line, having read the resource back from PayPal.
  readonly readBackAt: Date | null
  readonly event: LedgerEvent | null
  // Where the authorization behind the line stands now, as Hold last read it.
  readonly authorizationState: AuthorizationState | null
  // The final capture that released this rest of the hold in the same PayPal call, when no call of its own did.
  readonly releasedBy: { readonly capture: string } | null
}

export type PayPalRecord = { readonly simulated: boolean; readonly lines: readonly PayPalRecordLine[] }

type Shape = { readonly status: string; readonly actions: readonly Action[]; readonly id: keyof PayPalIds; readonly events: readonly string[] }

// What each line of the money log means in PayPal's words: the status the read-back found, the calls that lead to it,
// which of PayPal's ids it is, and the events PayPal sends about it (packages/paypal PAYPAL_EVENT_TYPES).
const CAPTURED: Shape = { status: 'COMPLETED', actions: ['capture'], id: 'capture', events: ['PAYMENT.CAPTURE.COMPLETED'] }
const SHAPES: Record<MoneyEventKind, Shape> = {
  fee_captured: { ...CAPTURED, actions: ['fee_capture'] },
  hold_placed: { status: 'CREATED', actions: ['authorize'], id: 'authorization', events: ['PAYMENT.AUTHORIZATION.CREATED'] },
  hold_renewed: { status: 'CREATED', actions: ['renew'], id: 'authorization', events: ['PAYMENT.AUTHORIZATION.CREATED'] },
  hold_captured: CAPTURED,
  hold_released: { status: 'VOIDED', actions: ['release', 'invoice'], id: 'authorization', events: ['PAYMENT.AUTHORIZATION.VOIDED'] },
  refunded: { status: 'COMPLETED', actions: ['refund'], id: 'refund', events: ['PAYMENT.CAPTURE.REFUNDED'] },
  invoice_sent: { status: 'SENT', actions: ['invoice'], id: 'invoice', events: [] },
  invoice_paid: { status: 'PAID', actions: ['invoice'], id: 'invoice', events: ['INVOICING.INVOICE.PAID'] },
  extension_captured: { ...CAPTURED, actions: ['extension_capture'] },
  // Money PayPal returned without Hold: no call of Hold's leads to it, and PayPal's refund names it.
  refunded_in_paypal: { status: 'COMPLETED', actions: [], id: 'refund', events: ['PAYMENT.CAPTURE.REFUNDED'] },
  fee_refunded_in_paypal: { status: 'COMPLETED', actions: [], id: 'refund', events: ['PAYMENT.CAPTURE.REFUNDED'] },
}
// A final capture releases the rest of the hold in the same call; the authorization then reads captured.
const REMAINDER: Shape = { status: 'CAPTURED', actions: ['capture'], id: 'authorization', events: [] }
// A reversal is PayPal taking a capture back: the line names the capture, which PayPal then reads reversed.
const REVERSED: Shape = { status: 'REVERSED', actions: [], id: 'capture', events: ['PAYMENT.CAPTURE.REVERSED'] }
const shapeOf = (kind: MoneyEventKind, reference: string) => (kind === 'hold_released' && reference.endsWith(':remainder') ? REMAINDER : (kind === 'refunded_in_paypal' || kind === 'fee_refunded_in_paypal') && reference.endsWith(':reversed') ? REVERSED : SHAPES[kind])

// Lines written in one moment keep the order money moves in, and a call not yet confirmed comes after them.
const ORDER: readonly MoneyEventKind[] = ['fee_captured', 'hold_placed', 'hold_renewed', 'hold_captured', 'hold_released', 'invoice_sent', 'invoice_paid', 'refunded', 'refunded_in_paypal', 'extension_captured', 'fee_refunded_in_paypal']
const rank = (line: PayPalRecordLine) => (line.kind === null ? ORDER.length : ORDER.indexOf(line.kind))

const paypalIds = (resources: Readonly<Record<string, string>>): PayPalIds => Object.fromEntries(CALL_IDS.flatMap((key) => (resources[key] === undefined ? [] : [[key, resources[key]]])))

export async function rentalPayPalRecord(transaction: Transaction, rentalId: string): Promise<PayPalRecord | undefined> {
  const [rental] = await transaction.select({ simulated: rentals.simulated }).from(rentals).where(eq(rentals.id, rentalId))
  if (rental === undefined) return undefined
  const logged = await transaction.select().from(moneyEvents).where(eq(moneyEvents.rentalId, rentalId))
  const calls = await transaction.select().from(executions).where(eq(executions.rentalId, rentalId))
  const held = await transaction.select({ paypalId: authorizations.paypalAuthorizationId, state: authorizations.state, id: authorizations.id, renewedFromId: authorizations.renewedFromId }).from(authorizations).innerJoin(holds, eq(holds.id, authorizations.holdId)).where(eq(holds.rentalId, rentalId))
  const bills = await transaction.select({ id: invoices.id, paypalId: invoices.paypalInvoiceId }).from(invoices).where(eq(invoices.rentalId, rentalId))
  const resources = new Set(logged.map((line) => resourceOf(line.paypalReference)))
  // Only an event whose signature was verified, or the demonstration's own, confirms anything. An event is stored before
  // Hold knows its rental, so it is found by the resource its body names, then read properly below.
  const received = resources.size === 0 ? [] : await transaction.select().from(paypalEvents).where(and(inArray(paypalEvents.verification, ['verified', 'simulated']), or(...[...resources].map((resource) => like(paypalEvents.rawBody, `%${resource}%`)))))
  const events = received.flatMap((event) => {
    const resource = eventResourceId(event.rawBody)
    return resource === undefined ? [] : [{ resource, type: event.type, eventId: event.paypalEventId, receivedAt: event.receivedAt, simulated: event.verification === 'simulated' }]
  }).sort((first, second) => first.receivedAt.getTime() - second.receivedAt.getTime())

  const matched = new Set<string>()
  const lines: PayPalRecordLine[] = logged.map((line) => {
    const shape = shapeOf(line.kind, line.paypalReference)
    const resource = resourceOf(line.paypalReference)
    // A renewal is asked for on the authorization it renews, and PayPal answers with a new one.
    const renewed = held.find((each) => each.paypalId === resource)?.renewedFromId
    // An invoice is asked for by Hold's own record of it, which PayPal's invoice id names.
    const asked = [resource, ...(line.kind === 'hold_renewed' ? held.filter((each) => each.id === renewed).map((each) => each.paypalId) : []), ...(shape.id === 'invoice' ? bills.filter((bill) => bill.paypalId === resource).map((bill) => bill.id) : [])]
    const call = calls.find((each) => shape.actions.includes(each.action) && Object.values(each.paypalResourceIds).some((id) => asked.includes(id)))
    if (call !== undefined) matched.add(call.id)
    const event = events.find((each) => each.resource === resource && shape.events.includes(each.type))
    const authorization = shape.id === 'authorization' ? resource : call?.paypalResourceIds['authorization']
    const state = held.find((each) => each.paypalId === authorization)?.state ?? null
    // What a final capture leaves of the hold goes back to the renter in that same call: the line names the capture once
    // and carries none of its ids, key or status, so it never reads as a second request to PayPal.
    if (shape === REMAINDER) {
      const capture = call?.paypalResourceIds['capture']
      return { kind: line.kind, action: null, currency: line.currency, amountCents: line.amountCents, ids: {}, paypalStatus: null, finalCapture: null, requestId: null, callState: null, at: line.occurredAt, readBackAt: line.recordedAt, event: null, authorizationState: state, releasedBy: capture === undefined ? null : { capture } }
    }
    return {
      kind: line.kind,
      action: call?.action ?? null,
      currency: line.currency,
      amountCents: line.amountCents,
      ids: { ...(call === undefined ? {} : paypalIds(call.paypalResourceIds)), [shape.id]: resource },
      paypalStatus: shape.status,
      finalCapture: line.kind === 'hold_captured' ? true : line.kind === 'fee_captured' && call?.paypalResourceIds['authorization'] !== undefined ? false : null,
      requestId: call?.idempotencyKey ?? null,
      callState: call?.state ?? null,
      at: line.occurredAt,
      readBackAt: line.recordedAt,
      event: event === undefined ? null : { type: event.type, eventId: event.eventId, receivedAt: event.receivedAt, simulated: event.simulated },
      authorizationState: state,
      releasedBy: null,
    }
  })
  for (const call of calls) {
    if (matched.has(call.id) || call.state === 'confirmed') continue
    lines.push({ kind: null, action: call.action, currency: call.currency ?? '', amountCents: call.amountCents ?? 0, ids: paypalIds(call.paypalResourceIds), paypalStatus: null, finalCapture: call.action === 'capture' ? true : null, requestId: call.idempotencyKey, callState: call.state, at: call.createdAt, readBackAt: null, event: null, authorizationState: null, releasedBy: null })
  }
  lines.sort((first, second) => first.at.getTime() - second.at.getTime() || rank(first) - rank(second) || (first.readBackAt?.getTime() ?? 0) - (second.readBackAt?.getTime() ?? 0))
  return { simulated: rental.simulated, lines }
}
