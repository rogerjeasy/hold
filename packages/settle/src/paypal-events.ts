import { expiredExtensionForCapture, settlementExecutionForResource, feeRentalByOrder, holdRentalByOrder, inShop, markPayPalEvent, payPalEvent, paypalAccounts, queueOperationsCheck } from '@hold/db'
import type { Transaction } from '@hold/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PayPalUnavailable } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { runExecution } from './executions.ts'
import { invoiceApprovedClaim } from './claim-invoice.ts'
import { checkLateExtensionPayment } from './extension-capture.ts'
import { applyFeeEvent } from './fee-capture.ts'
import { applyHoldEvent } from './hold-placement.ts'

// Applying an event PayPal delivered (architecture.md section 8.5). It is verified with PayPal first, and then only
// the resource it names is read back from PayPal: nothing in the event's body is believed. Applying it again changes
// nothing, since state machines only move forward and the money log takes each capture once.

const eventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource: z.object({ id: z.string().optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().optional() }).optional() }).optional() }).optional(),
})

export type EventOutcome = 'applied' | 'ignored' | 'rejected'

const header = (headers: Readonly<Record<string, string>>, name: string) => headers[name] ?? ''

async function webhookOf(transaction: Transaction, accountId: string) {
  const [account] = await transaction.select({ webhookId: paypalAccounts.webhookId, credentialReference: paypalAccounts.credentialReference }).from(paypalAccounts).where(eq(paypalAccounts.id, accountId))
  return account
}

export async function applyPayPalEvent(dependencies: SettleDependencies, message: { readonly shopId: string; readonly eventId: string }): Promise<EventOutcome> {
  const { shopId, eventId } = message
  const scope = { role: dependencies.role ?? 'hold_worker', shopId } as const
  const inScope = <Result>(work: (transaction: Transaction) => Promise<Result>) => inShop(dependencies.database, scope, work)
  const loaded = await inScope(async (transaction) => {
    const event = await payPalEvent(transaction, eventId)
    return { event, account: event === undefined ? undefined : await webhookOf(transaction, event.paypalAccountId) }
  })
  const { event, account } = loaded
  if (event === undefined || account === undefined) return 'ignored'
  if (event.processing !== 'pending') return event.verification === 'rejected' ? 'rejected' : event.processing === 'applied' ? 'applied' : 'ignored'
  const mark = (verification: 'verified' | 'rejected', processing: 'applied' | 'ignored' | 'failed', rentalId: string | null = null) =>
    inScope((transaction) => markPayPalEvent(transaction, eventId, { verification, processing, rentalId }))

  const paypal = dependencies.paypalFor(account.credentialReference)
  if (account.webhookId === null) {
    await mark('rejected', 'ignored')
    return 'rejected'
  }
  const { headers } = event
  const verified = await paypal.verifyWebhook({
    webhookId: account.webhookId,
    body: event.rawBody,
    headers: {
      transmissionId: header(headers, 'paypal-transmission-id'),
      transmissionTime: header(headers, 'paypal-transmission-time'),
      transmissionSig: header(headers, 'paypal-transmission-sig'),
      certUrl: header(headers, 'paypal-cert-url'),
      authAlgo: header(headers, 'paypal-auth-algo'),
    },
  })
  if (!verified.ok) throw new PayPalUnavailable(verified.error.kind)
  if (verified.value === 'rejected') {
    await mark('rejected', 'ignored')
    return 'rejected'
  }

  const parsed = eventSchema.safeParse(JSON.parse(event.rawBody))
  const body = parsed.success ? parsed.data : undefined
  if (body?.resource?.id !== undefined && ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.AUTHORIZATION.VOIDED', 'PAYMENT.CAPTURE.REFUNDED', 'INVOICING.INVOICE.PAID'].includes(body.event_type)) {
    const settlement = await inScope((transaction) => settlementExecutionForResource(transaction, body.resource?.id ?? '', body.event_type))
    if (settlement !== undefined) {
      const result = settlement.action === 'invoice' ? await invoiceApprovedClaim(dependencies, shopId, settlement.id, paypal) : await runExecution(dependencies, { shopId, executionId: settlement.id })
      await mark('verified', result === 'failed' ? 'failed' : 'applied', settlement.rentalId)
      return 'applied'
    }
    // A capture Hold stopped waiting for, which PayPal completed after all, goes to a person.
    const late = body.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? await inScope((transaction) => expiredExtensionForCapture(transaction, body.resource?.id ?? '')) : undefined
    if (late !== undefined) {
      const processing = await checkLateExtensionPayment(dependencies, shopId, late, paypal)
      await mark('verified', processing, late.rentalId)
      return processing
    }
  }
  // A dispute is answered from the operations agent's queue, where a person approves the answer. Nothing in the event
  // is believed: PayPal's own list must show it waiting on the shop, and then the agent is asked to look now, not the
  // next night. A new dispute may first sit in PayPal's review (sandbox, 28 October 2026), so its update counts too.
  if ((body?.event_type === 'CUSTOMER.DISPUTE.CREATED' || body?.event_type === 'CUSTOMER.DISPUTE.UPDATED') && body.resource?.id !== undefined) {
    const disputeId = body.resource.id
    const open = await paypal.listOpenDisputes()
    if (!open.ok) throw new PayPalUnavailable(open.error.kind)
    if (!open.value.some((dispute) => dispute.id === disputeId && dispute.open)) {
      await mark('verified', 'ignored')
      return 'ignored'
    }
    await inScope((transaction) => queueOperationsCheck(transaction, dependencies.now(), 'dispute_opened'))
    await mark('verified', 'applied')
    return 'applied'
  }
  // An order's own event names it; a capture or an authorization names the order it was made on.
  const orderId = body?.event_type === 'CHECKOUT.ORDER.APPROVED' ? body.resource?.id : body?.resource?.supplementary_data?.related_ids?.order_id
  if (body === undefined || orderId === undefined) {
    await mark('verified', 'ignored')
    return 'ignored'
  }
  const target = await inScope(async (transaction) => {
    const feeRental = await feeRentalByOrder(transaction, orderId)
    if (feeRental !== undefined) return { kind: 'fee', rentalId: feeRental } as const
    const holdRental = await holdRentalByOrder(transaction, orderId)
    return holdRental === undefined ? undefined : ({ kind: 'hold', rentalId: holdRental } as const)
  })
  if (target === undefined) {
    await mark('verified', 'ignored')
    return 'ignored'
  }
  const processing =
    target.kind === 'fee'
      ? await applyFeeEvent(dependencies, shopId, paypal, { type: body.event_type, orderId }, target.rentalId)
      : await applyHoldEvent(dependencies, shopId, paypal, { type: body.event_type, orderId, resourceId: body.resource?.id }, target.rentalId)
  await mark('verified', processing, target.rentalId)
  return processing === 'ignored' ? 'ignored' : 'applied'
}
