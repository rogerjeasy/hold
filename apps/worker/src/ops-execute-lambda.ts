import { carryOutProposal } from '@hold/ops'
import { z } from 'zod'
import { createQueueHandler } from './queue-batch.ts'
import { workerCarryOut } from './worker-operations.ts'

// Fed by the ops-execute queue (infra/lib/ops-worker.ts): a message or dispute answer a person approved on the
// morning queue, sent once.
const carryOut = workerCarryOut()
export const handler = createQueueHandler({ schema: z.strictObject({ shopId: z.uuid(), proposalId: z.uuid() }), handle: (message) => carryOutProposal(carryOut, message) })
