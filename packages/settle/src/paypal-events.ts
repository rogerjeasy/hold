import { beginFeeCapture, confirmFeeCapture, feeRentalByOrder, inShop, markPayPalEvent, payPalEvent, paypalAccounts } from '@hold/db'
import type { Transaction } from '@hold/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PayPalUnavailable, TRANSIENT } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
import { runExecution } from './fee-capture.ts'

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
  const orderId = body?.event_type === 'CHECKOUT.ORDER.APPROVED' ? body.resource?.id : body?.event_type === 'PAYMENT.CAPTURE.COMPLETED' ? body.resource?.supplementary_data?.related_ids?.order_id : undefined
  const rentalId = orderId === undefined ? undefined : await inScope((transaction) => feeRentalByOrder(transaction, orderId))
  if (body === undefined || orderId === undefined || rentalId === undefined) {
    await mark('verified', 'ignored')
    return 'ignored'
  }
  const now = dependencies.now()

  if (body.event_type === 'CHECKOUT.ORDER.APPROVED') {
    // The renter approved the fee but may never have come back to Hold. Read back: PayPal's record decides.
    const order = await paypal.readHoldOrder(orderId)
    if (!order.ok) throw new PayPalUnavailable(order.error.kind)
    const begun = order.value.status === 'approved' ? await inScope((transaction) => beginFeeCapture(transaction, rentalId, now)) : undefined
    if (begun === undefined || !begun.ok) {
      await mark('verified', 'ignored', rentalId)
      return 'ignored'
    }
    const outcome = await runExecution(dependencies, { shopId, executionId: begun.execution.id })
    await mark('verified', outcome === 'failed' ? 'failed' : 'applied', rentalId)
    return 'applied'
  }

  // PAYMENT.CAPTURE.COMPLETED: PayPal captured the fee. The order is read back for who paid and how much.
  const payment = await paypal.readFeePayment(orderId)
  if (!payment.ok) {
    if (TRANSIENT.has(payment.error.kind)) throw new PayPalUnavailable(payment.error.kind)
    await mark('verified', 'ignored', rentalId)
    return 'ignored'
  }
  const confirmed = await inScope(async (transaction) => {
    const begun = await beginFeeCapture(transaction, rentalId, now, { confirming: true })
    return begun.ok ? confirmFeeCapture(transaction, begun.execution.id, payment.value, now) : begun
  })
  await mark('verified', confirmed.ok ? 'applied' : 'failed', rentalId)
  return 'applied'
}
