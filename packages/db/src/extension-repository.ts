import { blocksItem, checkExtension, EXTENSION_TRANSITIONS, transition } from '@hold/domain'
import type { ExtensionProblem, ExtensionState, ExtensionTerms } from '@hold/domain'
import { and, desc, eq, inArray, ne } from 'drizzle-orm'
import { EXECUTIONS_QUEUE, markExecutionSent } from './fee-repository.ts'
import type { FeeExecution } from './fee-repository.ts'
import { authorizations, auditLog, executions, holds, moneyEvents, outbox, rentalExtensions, rentalItems, rentals, shops } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// More days a renter pays for from their own phone or assistant (architecture.md section 6.14). Plain code prices them
// from the day rates agreed at booking and checks the item is free and the hold still covers the return; the fee is
// its own PayPal order, captured through an execution like the rental fee. The hold is never touched.

export async function extensionMaxDays(transaction: Transaction): Promise<number> {
  const [shop] = await transaction.select({ days: shops.extensionMaxDays }).from(shops).limit(1)
  if (shop === undefined) throw new Error('No shop in scope.')
  return shop.days
}

// Already checked against EXTENSION_LIMITS.maxDays by the caller.
export async function saveExtensionMaxDays(transaction: Transaction, shopId: string, days: number): Promise<void> {
  await transaction.update(shops).set({ extensionMaxDays: days }).where(eq(shops.id, shopId))
}

type Refused = { readonly ok: false; readonly problem: ExtensionProblem | { readonly kind: 'not_found' } }

const LIVE_HOLDS: ReadonlySet<string> = new Set(['placed', 'renewing'])
const LIVE_AUTHORIZATIONS: ReadonlySet<string> = new Set(['created', 'renewed'])

// The rental's own facts and everything that could stand in the way of a new end, priced and checked by checkExtension.
async function checked(transaction: Transaction, rentalId: string, newEndsAt: Date, now: Date, lock = false) {
  const query = transaction.select({ id: rentals.id, shopId: rentals.shopId, state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt, currency: rentals.currency, maxDays: shops.extensionMaxDays, validUntil: authorizations.validUntil, holdState: holds.state, authorizationState: authorizations.state })
    .from(rentals).innerJoin(shops, eq(shops.id, rentals.shopId)).leftJoin(holds, eq(holds.rentalId, rentals.id)).leftJoin(authorizations, eq(authorizations.id, holds.currentAuthorizationId))
    .where(eq(rentals.id, rentalId))
  const [rental] = lock ? await query.for('update', { of: rentals }) : await query
  if (rental === undefined) return undefined
  const lines = await transaction.select({ itemId: rentalItems.itemId, dayRateCents: rentalItems.dayRateCents }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId))
  const extra = { startsAt: rental.endsAt, endsAt: newEndsAt }
  const others = lines.length === 0 ? [] : await transaction.select({ state: rentals.state, startsAt: rentals.startsAt, endsAt: rentals.endsAt, createdAt: rentals.createdAt })
    .from(rentalItems).innerJoin(rentals, eq(rentals.id, rentalItems.rentalId))
    .where(and(inArray(rentalItems.itemId, lines.map((line) => line.itemId)), ne(rentals.id, rentalId)))
  const blocking = others.filter((each) => newEndsAt > rental.endsAt && blocksItem(each, extra, now)).map((each) => each.startsAt.getTime())
  const result = checkExtension({
    state: rental.state,
    startsAt: rental.startsAt,
    endsAt: rental.endsAt,
    newEndsAt,
    now,
    maxDays: rental.maxDays,
    // Only a hold still placed, on an authorization PayPal still holds, covers more days: one at risk, being settled,
    // released or expired covers none, whatever its end date says.
    holdValidUntil: rental.holdState !== null && LIVE_HOLDS.has(rental.holdState) && rental.authorizationState !== null && LIVE_AUTHORIZATIONS.has(rental.authorizationState) ? rental.validUntil : null,
    lines: lines.map((line) => ({ dayRateCents: line.dayRateCents, count: 1 })),
    currency: rental.currency,
    nextBookingStartsAt: blocking.length === 0 ? null : new Date(Math.max(Math.min(...blocking), rental.endsAt.getTime())),
  })
  return { rental, result }
}

const move = async (transaction: Transaction, extensionId: string, from: ExtensionState, to: ExtensionState, also: Partial<typeof rentalExtensions.$inferInsert> = {}) => {
  if (!transition(EXTENSION_TRANSITIONS, from, to).ok) throw new Error(`An extension cannot move from ${from} to ${to}.`)
  await transaction.update(rentalExtensions).set({ ...also, state: to }).where(and(eq(rentalExtensions.id, extensionId), eq(rentalExtensions.state, from)))
}

export type ExtensionQuote = { readonly ok: true; readonly extensionId: string; readonly terms: ExtensionTerms } | Refused

// Prices a new end and keeps the quote. One the renter has not paid for yet makes way for it.
export async function quoteExtension(transaction: Transaction, rentalId: string, newEndsAt: Date, askedThrough: 'link' | 'assistant', now: Date): Promise<ExtensionQuote> {
  const found = await checked(transaction, rentalId, newEndsAt, now, true)
  if (found === undefined) return { ok: false, problem: { kind: 'not_found' } }
  if (!found.result.ok) return { ok: false, problem: found.result.error }
  const terms = found.result.value
  for (const earlier of await transaction.select({ id: rentalExtensions.id, state: rentalExtensions.state }).from(rentalExtensions).where(and(eq(rentalExtensions.rentalId, rentalId), inArray(rentalExtensions.state, ['quoted', 'ordered'])))) {
    await move(transaction, earlier.id, earlier.state, 'replaced')
  }
  const [created] = await transaction.insert(rentalExtensions)
    .values({ shopId: found.rental.shopId, rentalId, fromEndsAt: found.rental.endsAt, toEndsAt: terms.endsAt, extraDays: terms.extraDays, amountCents: terms.fee.cents, currency: terms.fee.currency, askedThrough, createdAt: now })
    .returning({ id: rentalExtensions.id })
  if (created === undefined) throw new Error('The extension was not quoted.')
  return { ok: true, extensionId: created.id, terms }
}

export type RentalExtension = typeof rentalExtensions.$inferSelect

// A rental's extensions, the newest first.
export async function rentalExtensionsOf(transaction: Transaction, rentalId: string): Promise<readonly RentalExtension[]> {
  return transaction.select().from(rentalExtensions).where(eq(rentalExtensions.rentalId, rentalId)).orderBy(desc(rentalExtensions.createdAt), desc(rentalExtensions.id))
}

// The quote the renter is paying for now, if any.
export async function openExtension(transaction: Transaction, rentalId: string): Promise<RentalExtension | undefined> {
  const [open] = await transaction.select().from(rentalExtensions).where(and(eq(rentalExtensions.rentalId, rentalId), inArray(rentalExtensions.state, ['quoted', 'ordered', 'capturing']))).orderBy(desc(rentalExtensions.createdAt)).limit(1)
  return open
}

// Keeps the PayPal order the person is approving, so a second visit reuses it.
export async function saveExtensionOrder(transaction: Transaction, extensionId: string, orderId: string): Promise<void> {
  await move(transaction, extensionId, 'quoted', 'ordered', { paypalOrderId: orderId })
}

export type BeginExtension = { readonly ok: true; readonly execution: FeeExecution } | { readonly ok: false; readonly reason: 'not_found' | 'quote_stale' | ExtensionProblem['kind'] }

const captureKey = (extensionId: string) => `extension-capture-${extensionId}`

// PayPal shows the order approved. Everything is checked again, since the days could have been booked meanwhile; then
// the new end is applied at once, so nobody else can book those days while PayPal captures, and one execution is
// recorded with its outbox message. Asked again, it returns the same execution.
export async function beginExtensionCapture(transaction: Transaction, rentalId: string, orderId: string, now: Date): Promise<BeginExtension> {
  const [extension] = await transaction.select().from(rentalExtensions).where(and(eq(rentalExtensions.rentalId, rentalId), eq(rentalExtensions.paypalOrderId, orderId))).for('update')
  if (extension === undefined) return { ok: false, reason: 'not_found' }
  const execution = (id: string): FeeExecution => ({ id, rentalId, orderId, idempotencyKey: captureKey(extension.id), amountCents: extension.amountCents, currency: extension.currency })
  const [existing] = await transaction.select({ id: executions.id }).from(executions).where(eq(executions.idempotencyKey, captureKey(extension.id)))
  if (existing !== undefined) return { ok: true, execution: execution(existing.id) }
  if (extension.state !== 'ordered') return { ok: false, reason: 'quote_stale' }
  const found = await checked(transaction, rentalId, extension.toEndsAt, now, true)
  if (found === undefined) return { ok: false, reason: 'not_found' }
  // The rental's end moved since the quote, by another extension or by staff: the quote no longer prices these days.
  if (found.rental.endsAt.getTime() !== extension.fromEndsAt.getTime()) return { ok: false, reason: 'quote_stale' }
  if (!found.result.ok) return { ok: false, reason: found.result.error.kind }
  if (found.result.value.fee.cents !== extension.amountCents) return { ok: false, reason: 'quote_stale' }
  await transaction.update(rentals).set({ endsAt: extension.toEndsAt }).where(eq(rentals.id, rentalId))
  await move(transaction, extension.id, 'ordered', 'capturing')
  const [created] = await transaction.insert(executions)
    .values({ shopId: extension.shopId, rentalId, action: 'extension_capture', idempotencyKey: captureKey(extension.id), currency: extension.currency, amountCents: extension.amountCents, paypalResourceIds: { order: orderId }, createdAt: now, updatedAt: now })
    .returning({ id: executions.id })
  if (created === undefined) throw new Error('The execution was not created.')
  await transaction.insert(outbox).values({ shopId: extension.shopId, queue: EXECUTIONS_QUEUE, messageGroup: rentalId, payload: { executionId: created.id }, createdAt: now })
  return { ok: true, execution: execution(created.id) }
}

async function extensionOf(transaction: Transaction, executionId: string) {
  const [execution] = await transaction.select().from(executions).where(eq(executions.id, executionId)).for('update')
  if (execution?.action !== 'extension_capture') return undefined
  const [extension] = await transaction.select().from(rentalExtensions).where(eq(rentalExtensions.paypalOrderId, execution.paypalResourceIds['order'] ?? '')).for('update')
  return extension === undefined ? undefined : { execution, extension }
}

export type CapturedExtension = { readonly orderId: string; readonly captureId: string; readonly status: string; readonly amount: { readonly cents: number; readonly currency: string } }

// Applies what PayPal read back: the extension is paid and the money log gets its own line. Applying it again changes
// nothing. A capture that is not the quoted fee, to the cent, is not applied.
export async function confirmExtensionCapture(transaction: Transaction, executionId: string, payment: CapturedExtension, now: Date): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'amount_mismatch' | 'not_completed' }> {
  const found = await extensionOf(transaction, executionId)
  if (found === undefined) return { ok: false, reason: 'not_found' }
  const { execution, extension } = found
  if (execution.state === 'confirmed') return { ok: true }
  if (payment.status !== 'completed') return { ok: false, reason: 'not_completed' }
  if (payment.amount.cents !== extension.amountCents || payment.amount.currency !== extension.currency) return { ok: false, reason: 'amount_mismatch' }
  await move(transaction, extension.id, 'capturing', 'paid', { paidAt: now })
  await transaction.insert(moneyEvents)
    .values({ shopId: extension.shopId, rentalId: extension.rentalId, kind: 'extension_captured', currency: payment.amount.currency, amountCents: payment.amount.cents, paypalReference: payment.captureId, occurredAt: now })
    .onConflictDoNothing()
  await transaction.update(executions)
    .set({ state: 'confirmed', attempts: execution.attempts + 1, paypalResourceIds: { ...execution.paypalResourceIds, capture: payment.captureId }, updatedAt: now })
    .where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  return { ok: true }
}

// PayPal refused the capture for good. Nothing was taken, so the rental's end goes back to where it was, unless
// something else moved it since, and the renter is told on their page.
// PayPal captured an amount that is not the quoted fee. Money moved, so nothing is undone: the new end stays, the
// extension stays capturing, and a person is asked to look, through the audit trail and the execution's error.
export async function flagExtensionCapture(transaction: Transaction, executionId: string, detail: Readonly<Record<string, unknown>>, now: Date): Promise<void> {
  const found = await extensionOf(transaction, executionId)
  if (found === undefined || found.execution.state === 'confirmed') return
  await transaction.update(executions).set({ state: 'failed', lastError: 'amount_mismatch', attempts: found.execution.attempts + 1, updatedAt: now }).where(eq(executions.id, executionId))
  await transaction.insert(auditLog).values({ shopId: found.extension.shopId, actorKind: 'system', action: 'extension.capture_mismatch', subjectKind: 'rental', subjectId: found.extension.rentalId, detail: { ...detail }, at: now })
  await markExecutionSent(transaction, executionId, now)
}

export async function failExtensionCapture(transaction: Transaction, executionId: string, reason: string, now: Date): Promise<void> {
  const found = await extensionOf(transaction, executionId)
  if (found === undefined || found.execution.state === 'confirmed' || found.extension.state !== 'capturing') return
  const { extension } = found
  await transaction.update(rentals).set({ endsAt: extension.fromEndsAt }).where(and(eq(rentals.id, extension.rentalId), eq(rentals.endsAt, extension.toEndsAt)))
  await move(transaction, extension.id, 'capturing', 'failed')
  await transaction.update(executions).set({ state: 'failed', lastError: reason, attempts: found.execution.attempts + 1, updatedAt: now }).where(eq(executions.id, executionId))
  await transaction.insert(auditLog).values({ shopId: extension.shopId, actorKind: 'system', action: 'extension.capture_failed', subjectKind: 'rental', subjectId: extension.rentalId, detail: { reason }, at: now })
  await markExecutionSent(transaction, executionId, now)
}
