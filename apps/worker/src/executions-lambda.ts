import { executionMessageSchema, runExecution } from '@hold/settle'
import { createQueueHandler } from './queue-batch.ts'
import { workerSettle } from './worker-settle.ts'

// Fed by the executions queue (infra/lib/worker.ts): carries out each approved action with PayPal.
const settle = workerSettle()
export const handler = createQueueHandler({ schema: executionMessageSchema, handle: (message) => runExecution(settle, message) })
