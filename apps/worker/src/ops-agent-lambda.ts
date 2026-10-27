import { runOperations } from '@hold/ops'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'
import { workerOperations } from './worker-operations.ts'

// Fed by the ops-agent queue (infra/lib/worker.ts), one message per shop: from the nightly fan-out, or when a dispute
// opens, a hold becomes at risk or a capture fails. The queue is ordered per shop, so one shop's runs never overlap.
const operations = workerOperations()
export const opsAgentMessageSchema = z.strictObject({ shopId: z.uuid(), trigger: z.enum(['nightly', 'dispute_opened', 'hold_at_risk', 'capture_failed', 'manual']) })
export const handler = createQueueHandler({ schema: opsAgentMessageSchema, handle: (message) => runOperations(operations, message) })
