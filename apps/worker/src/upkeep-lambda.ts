import { runUpkeep, upkeepMessageSchema } from '@hold/settle'
import { createQueueHandler } from './queue-batch.ts'
import { workerSettle } from './worker-settle.ts'

// Fed by the upkeep queue (infra/lib/worker.ts), which each hold's schedules send to: replaces a hold before its end,
// or marks it expired at its end and tells the owners.
const settle = workerSettle()
export const handler = createQueueHandler({ schema: upkeepMessageSchema, handle: (message) => runUpkeep(settle, message) })
