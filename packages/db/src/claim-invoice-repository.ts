import { CLAIM_TRANSITIONS, HOLD_TRANSITIONS, money, settle, transition } from '@hold/domain'
import { and, eq } from 'drizzle-orm'
import { queueSettlementReceipts } from './receipt-repository.ts'
import { EXECUTIONS_QUEUE, markExecutionSent } from './fee-repository.ts'
import { claimCollectionReady } from './claim-resolution.ts'
import { closeSettledRental, settlementWork } from './settlement-repository.ts'
import { authorizations, claimLines, claims, executions, holds, invoices, moneyEvents, outbox, priceEntries, rentals, renters } from './schema/index.ts'
import type { Transaction } from './scope.ts'
import { markOutcomeOpen } from './trust-repository.ts'

export async function beginClaimInvoice(transaction: Transaction, captureExecutionId: string, failed: boolean, reason: string, now: Date) {
  const work = await settlementWork(transaction, captureExecutionId)
  if (work?.claim === undefined) return undefined
  const { claim, hold } = work
  const key = `claim-invoice-${claim.id}`
  const [existing] = await transaction.select().from(executions).where(eq(executions.idempotencyKey, key))
  if (existing !== undefined) return existing.id
  const amount = failed ? claim.totalCents : settle(money(claim.totalCents, claim.currency), money(hold.reservedCents, hold.currency)).invoice.cents
  if (amount <= 0) return undefined
  if (failed && claim.state !== 'charge_failed') {
    let holdState = hold.state
    if (transition(HOLD_TRANSITIONS, holdState, 'capturing').ok) { await transaction.update(holds).set({ state: 'capturing' }).where(eq(holds.id, hold.id)); holdState = 'capturing' }
    if ((holdState !== 'expired' && !transition(HOLD_TRANSITIONS, holdState, 'capture_failed').ok) || !transition(CLAIM_TRANSITIONS, claim.state, 'charge_failed').ok) return undefined
    if (holdState !== 'expired') await transaction.update(holds).set({ state: 'capture_failed' }).where(eq(holds.id, hold.id))
    await transaction.update(claims).set({ state: 'charge_failed' }).where(eq(claims.id, claim.id))
    await transaction.update(executions).set({ state: 'failed', lastError: reason, updatedAt: now }).where(eq(executions.id, captureExecutionId))
    await markExecutionSent(transaction, captureExecutionId, now)
  }
  if (!await claimCollectionReady(transaction, claim.id, now)) return undefined
  const [bill] = await transaction.insert(invoices).values({ shopId: claim.shopId, rentalId: claim.rentalId, claimId: claim.id, currency: claim.currency, amountCents: amount, createdAt: now }).returning()
  if (bill === undefined) throw new Error('The invoice was not recorded.')
  const [created] = await transaction.insert(executions).values({ shopId: claim.shopId, rentalId: claim.rentalId, holdId: hold.id, action: 'invoice', idempotencyKey: key, currency: claim.currency, amountCents: amount, paypalResourceIds: { invoice: bill.id, claim: claim.id, purpose: failed ? 'capture_failed' : 'excess' }, createdAt: now, updatedAt: now }).returning()
  if (created === undefined) throw new Error('The invoice execution was not recorded.')
  await transaction.insert(outbox).values({ shopId: claim.shopId, queue: EXECUTIONS_QUEUE, messageGroup: claim.rentalId, payload: { executionId: created.id }, createdAt: now })
  return created.id
}

export async function claimInvoiceWork(transaction: Transaction, executionId: string) {
  const [execution] = await transaction.select().from(executions).where(and(eq(executions.id, executionId), eq(executions.action, 'invoice')))
  const billId = execution?.paypalResourceIds['invoice']
  if (execution === undefined || billId === undefined) return undefined
  const [bill] = await transaction.select().from(invoices).where(eq(invoices.id, billId))
  const [payer] = await transaction.select({ email: renters.email }).from(rentals).innerJoin(renters, eq(renters.id, rentals.renterId)).where(eq(rentals.id, execution.rentalId))
  const work = await settlementWork(transaction, executionId)
  if (bill === undefined || payer === undefined || work === undefined) return undefined
  const entries = await transaction.select({ description: priceEntries.description }).from(claimLines).innerJoin(priceEntries, eq(priceEntries.id, claimLines.priceEntryId)).where(eq(claimLines.claimId, bill.claimId))
  return { ...work, bill, email: payer.email, description: entries.map((entry) => entry.description).join(', ') }
}

export async function confirmClaimInvoiced(transaction: Transaction, executionId: string, read: { readonly invoiceId: string; readonly status: 'sent' | 'paid'; readonly claimReference: string; readonly amount: { readonly cents: number; readonly currency: string } }, released: { readonly authorizationId: string; readonly status: string } | null, now: Date) {
  const work = await claimInvoiceWork(transaction, executionId)
  if (work === undefined || read.claimReference !== work.bill.claimId || read.amount.cents !== work.bill.amountCents || read.amount.currency !== work.bill.currency || (work.bill.paypalInvoiceId !== null && read.invoiceId !== work.bill.paypalInvoiceId)) return false
  const fallback = work.execution.paypalResourceIds['purpose'] === 'capture_failed'
  if (fallback && (released === null || released.authorizationId !== work.authorization.paypalAuthorizationId || !['voided', 'expired'].includes(released.status))) return false
  await transaction.update(invoices).set({ paypalInvoiceId: read.invoiceId, state: read.status }).where(eq(invoices.id, work.bill.id))
  if (fallback && transition(HOLD_TRANSITIONS, work.hold.state, 'invoiced').ok) await transaction.update(holds).set({ state: 'invoiced' }).where(eq(holds.id, work.hold.id))
  if (fallback && released !== null) {
    await transaction.update(authorizations).set({ state: released.status === 'voided' ? 'voided' : 'expired' }).where(eq(authorizations.id, work.authorization.id))
    if (released.status === 'voided') await transaction.insert(moneyEvents).values({ shopId: work.hold.shopId, rentalId: work.hold.rentalId, holdId: work.hold.id, kind: 'hold_released', currency: work.hold.currency, amountCents: work.hold.reservedCents, paypalReference: `${released.authorizationId}:voided`, occurredAt: now }).onConflictDoNothing()
  }
  // A decided claim now waits on the invoice: the renter's record shows it open, and unpaid once it is past due.
  if (read.status === 'sent') await markOutcomeOpen(transaction, work.bill.rentalId, now)
  await transaction.insert(moneyEvents).values({ shopId: work.bill.shopId, rentalId: work.bill.rentalId, holdId: work.hold.id, kind: 'invoice_sent', currency: read.amount.currency, amountCents: read.amount.cents, paypalReference: `${read.invoiceId}:sent`, occurredAt: now }).onConflictDoNothing()
  if (read.status === 'paid' && work.claim !== undefined) {
    await transaction.insert(moneyEvents).values({ shopId: work.bill.shopId, rentalId: work.bill.rentalId, holdId: work.hold.id, kind: 'invoice_paid', currency: read.amount.currency, amountCents: read.amount.cents, paypalReference: `${read.invoiceId}:paid`, occurredAt: now }).onConflictDoNothing()
    let state = work.claim.state
    for (const target of ['charging', 'charged', 'closed'] as const) {
      if (transition(CLAIM_TRANSITIONS, state, target).ok) { await transaction.update(claims).set({ state: target }).where(eq(claims.id, work.claim.id)); state = target }
    }
    if (state === 'closed') await closeSettledRental(transaction, work.claim.rentalId, fallback ? 'invoiced' : work.hold.state, now)
  }
  await transaction.update(executions).set({ state: 'confirmed', lastError: null, updatedAt: now }).where(eq(executions.id, executionId))
  await markExecutionSent(transaction, executionId, now)
  await queueSettlementReceipts(transaction, work.bill.rentalId, now, [`${read.invoiceId}:sent`, ...(read.status === 'paid' ? [`${read.invoiceId}:paid`] : []), ...(fallback && released?.status === 'voided' ? [`${released.authorizationId}:voided`] : [])])
  return true
}
