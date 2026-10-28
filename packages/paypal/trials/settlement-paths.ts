import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { describe, must, startTrial } from './support.ts'

// Trials for tech-stack.md section 16, item 6, and the claim-settlement paths that had met only recorded replies: a
// refund, an invoice, and a shop's evidence on a dispute. Two steps:
//   pay-refund-invoice  a fee order the renter approves, captured, then part of it refunded, and an invoice sent to
//                       the payer for a damage line, each read back
//   dispute-evidence    once the renter has opened a dispute on that payment from the sandbox personal account, the
//                       dispute is found by its capture and answered with notes and a PDF, then read back

const FEE_CENTS = 10_00
const REFUND_CENTS = 1_00
const INVOICE_CENTS = 2_00
const STATE_FILE = join(import.meta.dirname, 'recordings', 'settlement-state.json')
const APPROVAL_LIMIT_MILLISECONDS = 15 * 60 * 1000

type State = { readonly orderId: string; readonly captureId: string; readonly payerEmail: string }

// The smallest well-formed PDF, standing in for a rental's evidence pack.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

const STEPS = ['pay-refund-invoice', 'dispute-evidence'] as const
const step = STEPS.find((name) => name === process.argv[2])
if (step === undefined) throw new Error(`Say which step: ${STEPS.join(', ')}.`)

const trial = startTrial(`settlement-paths-${step}`)
const { holds } = trial

if (step === 'pay-refund-invoice') {
  const order = must(await holds.createFeeOrder({ amount: trial.money(FEE_CENTS), rentalReference: `trial-settlement-${trial.key()}`, description: 'Hold trial. A rental fee to refund in part.', returnUrl: 'https://example.com/hold/approved', cancelUrl: 'https://example.com/hold/cancelled', idempotencyKey: trial.key() }), 'Creating the fee order')
  console.log(`\nApprove this order with a sandbox personal account. The trial continues by itself.\n  ${order.approvalUrl ?? 'no approval link'}\n`)
  const deadline = Date.now() + APPROVAL_LIMIT_MILLISECONDS
  for (;;) {
    const read = must(await holds.readHoldOrder(order.orderId), 'Reading the order')
    if (read.status === 'approved') break
    if (Date.now() > deadline) throw new Error('The order was not approved in time.')
    await wait(3000)
  }
  const paid = must(await holds.captureFeeOrder({ orderId: order.orderId, idempotencyKey: trial.key() }), 'Capturing the fee')
  trial.check('The fee is captured', paid.status === 'completed', `status ${paid.status}, ${String(paid.amount.cents)} cents, payer ${paid.payer.email}`)

  const refund = await holds.refundCapture({ captureId: paid.captureId, amount: trial.money(REFUND_CENTS), idempotencyKey: trial.key() })
  trial.check('Part of the capture is refunded', refund.ok && refund.value.amount.cents === REFUND_CENTS, describe(refund, (value) => `${value.refundId}, status ${value.status}, ${String(value.amount.cents)} cents`))
  if (refund.ok) {
    const readBack = await holds.readRefund(refund.value.refundId, paid.captureId)
    trial.check('The refund reads back for its capture', readBack.ok && readBack.value.captureId === paid.captureId, describe(readBack, (value) => `status ${value.status}, capture ${value.captureId}`))
  }

  const reference = `HOLD-TRIAL-${trial.key().slice(0, 8)}`
  const invoice = await holds.invoiceClaim({ invoiceNumber: reference, claimReference: reference, email: paid.payer.email, amount: trial.money(INVOICE_CENTS), description: 'Hold trial. A damage line beyond the hold.', idempotencyKey: trial.key() })
  trial.check('An invoice is created and sent to the payer', invoice.ok && invoice.value.status === 'sent', describe(invoice, (value) => `${value.invoiceId}, status ${value.status}, ${String(value.amount.cents)} cents, reference ${value.claimReference}`))
  const again = await holds.invoiceClaim({ invoiceNumber: reference, claimReference: reference, email: paid.payer.email, amount: trial.money(INVOICE_CENTS), description: 'Hold trial. A damage line beyond the hold.', idempotencyKey: trial.key() })
  trial.check('Asked again, the same invoice is found, not a second made', again.ok && invoice.ok && again.value.invoiceId === invoice.value.invoiceId, describe(again, (value) => value.invoiceId))

  const state: State = { orderId: order.orderId, captureId: paid.captureId, payerEmail: paid.payer.email }
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
  console.log(`\nSaved. Open a dispute on this payment from the same sandbox personal account at sandbox.paypal.com (Activity, the payment, Report a problem), then run:\n  pnpm --filter @hold/paypal trial:settlement dispute-evidence`)
} else {
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as State
  const open = must(await holds.listOpenDisputes(), 'Listing open disputes')
  const dispute = open.find((each) => each.captureIds.includes(state.captureId))
  trial.check('The renter’s dispute is listed, naming the capture', dispute !== undefined, dispute === undefined ? `none of ${String(open.length)} open disputes names ${state.captureId}` : `${dispute.id}, due ${dispute.responseDueAt?.toISOString() ?? 'not given'}`)
  if (dispute !== undefined) {
    const key = trial.key()
    const answered = await holds.provideDisputeEvidence({ disputeId: dispute.id, notes: 'Hold trial. The rental was returned with a new scratch; the evidence pack shows the handover and return photographs.', document: { fileName: 'evidence-pack.pdf', bytes: PDF }, idempotencyKey: key })
    trial.check('The shop’s notes and the evidence pack are accepted as evidence', answered.ok, describe(answered, () => 'accepted'))
    const repeated = await holds.provideDisputeEvidence({ disputeId: dispute.id, notes: 'Hold trial. The rental was returned with a new scratch; the evidence pack shows the handover and return photographs.', document: { fileName: 'evidence-pack.pdf', bytes: PDF }, idempotencyKey: key })
    trial.check('The same answer sent again with its key is not refused', repeated.ok, describe(repeated, () => 'accepted'))
    const after = must(await holds.listOpenDisputes(), 'Listing open disputes again')
    console.log(`  after: ${JSON.stringify(after.find((each) => each.id === dispute.id) ?? 'no longer open')}`)
  }
}

await trial.finish()
