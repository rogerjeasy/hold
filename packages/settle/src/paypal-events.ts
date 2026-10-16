import { feeRentalByOrder, holdRentalByOrder, inShop, markPayPalEvent, payPalEvent, paypalAccounts } from '@hold/db'
import type { Transaction } from '@hold/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { PayPalUnavailable } from './dependencies.ts'
import type { SettleDependencies } from './dependencies.ts'
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
