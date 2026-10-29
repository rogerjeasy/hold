import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { executions, invoices } from './schema/index.ts'
import type { Transaction } from './scope.ts'
export async function settlementExecutionForResource(transaction: Transaction, resourceId: string, type: string) {
  if (type === 'INVOICING.INVOICE.PAID') {
    const [bill] = await transaction.select().from(invoices).where(eq(invoices.paypalInvoiceId, resourceId))
    if (bill === undefined) return undefined
    return (await transaction.select({ id: executions.id, rentalId: executions.rentalId, action: executions.action }).from(executions).where(and(eq(executions.action, 'invoice'), sql`${executions.paypalResourceIds} ->> 'invoice' = ${bill.id}`)))[0]
  }
  const resource = type === 'PAYMENT.AUTHORIZATION.VOIDED' ? 'authorization' : type === 'PAYMENT.CAPTURE.REFUNDED' ? 'refund' : 'capture'
  // A capture is a hold's, or an extension's from its own order (architecture.md section 6.14).
  const actions: ('release' | 'refund' | 'capture' | 'extension_capture')[] = type === 'PAYMENT.AUTHORIZATION.VOIDED' ? ['release'] : type === 'PAYMENT.CAPTURE.REFUNDED' ? ['refund'] : ['capture', 'extension_capture']
  const [row] = await transaction.select({ id: executions.id, rentalId: executions.rentalId, action: executions.action }).from(executions).where(and(inArray(executions.action, actions), sql`${executions.paypalResourceIds} ->> ${resource} = ${resourceId}`, or(eq(executions.state, 'pending'), eq(executions.state, 'submitted'))))
  return row
}
