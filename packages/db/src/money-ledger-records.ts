import type { ClaimState, HoldState, MoneyEventKind } from '@hold/domain'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { auditLog, claims, executions, holds, moneyEvents, paypalEvents, rentals, renters, shopExceptions } from './schema/index.ts'
import { eventResourceId, resourceOf } from './paypal-resources.ts'
import type { Transaction } from './scope.ts'
import { rentalName } from './rental-name.ts'

// What the money ledger reads (extensions.md section 12.5): every line of the shop's money log with what confirms it,
// and each rental it belongs to with what its money is checked against. Plain rows; what each line did and whether a
// rental's money agrees is worked out from them by the domain's rentalMoney on the way to the screen.

export type LedgerEvent = { readonly type: string; readonly eventId: string; readonly receivedAt: Date; readonly simulated: boolean }
export type LedgerExecution = { readonly action: string; readonly idempotencyKey: string; readonly attempts: number }

export type LedgerRecord = {
  readonly id: string
  readonly rentalId: string
  readonly kind: MoneyEventKind
  readonly currency: string
  readonly amountCents: number
  readonly paypalFeeCents: number | null
  readonly netCents: number | null
  readonly paypalReference: string
  // When PayPal says it happened, and when Hold wrote it, having read it back from PayPal.
  readonly occurredAt: Date
  readonly recordedAt: Date
  // The PayPal event about the same resource, once its signature was verified, and the execution that read it back.
  readonly event: LedgerEvent | null
  readonly execution: LedgerExecution | null
}

export type LedgerAuditLine = { readonly action: string; readonly actorKind: string; readonly at: Date }

export type LedgerRental = {
  readonly rentalId: string
  readonly renterName: string | null
  readonly startsAt: Date
  readonly endsAt: Date
  readonly simulated: boolean
  readonly currency: string
  readonly reservedCents: number | null
  readonly holdState: HoldState | null
  // The rung of the shop's trust ladder that lowered the hold, and the hold the renter agreed to before it did.
  readonly trustRung: number | null
  readonly ordinaryCents: number | null
  // The claim's total once a person approved it.
  readonly claimCents: number | null
  readonly paypalDiffers: boolean
  readonly audit: readonly LedgerAuditLine[]
}

export type MoneyLedgerRecords = { readonly lines: readonly LedgerRecord[]; readonly rentals: readonly LedgerRental[] }

// A claim no person has approved yet, or one a person waived, gives no total a capture may reach.
const UNAPPROVED: readonly ClaimState[] = ['draft', 'awaiting_approval', 'waived']

// Lines written in one moment keep the order money moves in: a hold before its capture, a capture before the release
// of what is left.
const KIND_ORDER = sql`case ${moneyEvents.kind} when 'fee_captured' then 0 when 'hold_placed' then 1 when 'hold_renewed' then 2 when 'hold_captured' then 3 when 'hold_released' then 4 when 'invoice_sent' then 5 when 'invoice_paid' then 6 else 7 end`

export async function moneyLedgerRecords(transaction: Transaction): Promise<MoneyLedgerRecords> {
  const rows = await transaction
    .select({
      id: moneyEvents.id,
      rentalId: moneyEvents.rentalId,
      kind: moneyEvents.kind,
      currency: moneyEvents.currency,
      amountCents: moneyEvents.amountCents,
      paypalFeeCents: moneyEvents.paypalFeeCents,
      netCents: moneyEvents.netCents,
      paypalReference: moneyEvents.paypalReference,
      occurredAt: moneyEvents.occurredAt,
      recordedAt: moneyEvents.recordedAt,
    })
    .from(moneyEvents)
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.recordedAt), KIND_ORDER)
  if (rows.length === 0) return { lines: [], rentals: [] }
  const rentalIds = [...new Set(rows.map((row) => row.rentalId))]

  // Only an event whose signature was verified, or the demonstration's own, confirms anything.
  const events = await transaction
    .select({ type: paypalEvents.type, eventId: paypalEvents.paypalEventId, receivedAt: paypalEvents.receivedAt, verification: paypalEvents.verification, rawBody: paypalEvents.rawBody })
    .from(paypalEvents)
    .where(inArray(paypalEvents.verification, ['verified', 'simulated']))
    .orderBy(asc(paypalEvents.receivedAt))
  const eventOf = new Map<string, LedgerEvent>()
  for (const event of events) {
    const id = eventResourceId(event.rawBody)
    if (id !== undefined && !eventOf.has(id)) eventOf.set(id, { type: event.type, eventId: event.eventId, receivedAt: event.receivedAt, simulated: event.verification === 'simulated' })
  }
  const sent = await transaction.select({ action: executions.action, idempotencyKey: executions.idempotencyKey, attempts: executions.attempts, resources: executions.paypalResourceIds }).from(executions).where(inArray(executions.rentalId, rentalIds))
  const executionOf = new Map<string, LedgerExecution>()
  for (const execution of sent) for (const id of Object.values(execution.resources)) executionOf.set(id, { action: execution.action, idempotencyKey: execution.idempotencyKey, attempts: execution.attempts })

  const rentalRows = await transaction
    .select({ rentalId: rentals.id, renterName: rentalName, startsAt: rentals.startsAt, endsAt: rentals.endsAt, simulated: rentals.simulated, currency: rentals.currency, holdId: holds.id, reservedCents: holds.reservedCents, holdState: holds.state, trustRung: holds.trustRung, ordinaryCents: holds.ordinaryCents, claimId: claims.id, claimState: claims.state, claimCents: claims.totalCents })
    .from(rentals)
    .leftJoin(renters, eq(renters.id, rentals.renterId))
    .leftJoin(holds, eq(holds.rentalId, rentals.id))
    .leftJoin(claims, eq(claims.rentalId, rentals.id))
    .where(inArray(rentals.id, rentalIds))
  const differing = await transaction
    .select({ rentalId: shopExceptions.rentalId })
    .from(shopExceptions)
    .where(and(eq(shopExceptions.kind, 'reconciliation_difference'), isNull(shopExceptions.resolvedAt), inArray(shopExceptions.rentalId, rentalIds)))
  const differs = new Set(differing.map((row) => row.rentalId))
  // A rental's audit trail is what was recorded about the rental, its hold and its claim.
  const subjectsOf = new Map(rentalRows.map((rental) => [rental.rentalId, [rental.rentalId, rental.holdId, rental.claimId].filter((id): id is string => id !== null)]))
  const audit = await transaction
    .select({ subjectId: auditLog.subjectId, action: auditLog.action, actorKind: auditLog.actorKind, at: auditLog.at })
    .from(auditLog)
    .where(inArray(auditLog.subjectId, [...subjectsOf.values()].flat()))
    .orderBy(asc(auditLog.at))

  return {
    lines: rows.map((row) => ({ ...row, event: eventOf.get(resourceOf(row.paypalReference)) ?? null, execution: executionOf.get(resourceOf(row.paypalReference)) ?? null })),
    rentals: rentalRows.map((rental) => {
      const subjects = subjectsOf.get(rental.rentalId) ?? []
      return {
        rentalId: rental.rentalId,
        renterName: rental.renterName,
        startsAt: rental.startsAt,
        endsAt: rental.endsAt,
        simulated: rental.simulated,
        currency: rental.currency,
        reservedCents: rental.reservedCents,
        holdState: rental.holdState,
        trustRung: rental.trustRung,
        ordinaryCents: rental.ordinaryCents,
        claimCents: rental.claimState === null || UNAPPROVED.includes(rental.claimState) ? null : rental.claimCents,
        paypalDiffers: differs.has(rental.rentalId),
        audit: audit.filter((line) => line.subjectId !== null && subjects.includes(line.subjectId)).map(({ action, actorKind, at }) => ({ action, actorKind, at })),
      }
    }),
  }
}
