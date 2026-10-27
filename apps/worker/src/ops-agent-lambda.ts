import { opsAgentMessageSchema, runOperations } from '@hold/ops'
import { createQueueHandler } from './queue-batch.ts'
import { workerOperations } from './worker-operations.ts'

// Fed by the ops-agent queue (infra/lib/worker.ts), one message per shop: from the nightly fan-out, or when a dispute
// opens, a hold becomes at risk or a capture fails. The queue is ordered per shop, so one shop's runs never overlap.
const operations = workerOperations()
export const handler = createQueueHandler({ schema: opsAgentMessageSchema, handle: (message) => runOperations(operations, message) })
