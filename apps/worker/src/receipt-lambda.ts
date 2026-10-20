import { createQueueHandler } from './queue-batch.ts'
import { receiptMessageSchema, sendSettlementReceipt } from './settlement-receipt.ts'
import { workerReceipts } from './worker-receipts.ts'

const dependencies = workerReceipts()
export const handler = createQueueHandler({ schema: receiptMessageSchema, handle: (message) => sendSettlementReceipt(dependencies, message) })
