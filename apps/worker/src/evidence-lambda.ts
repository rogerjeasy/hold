import { evidenceMessageSchema, makeEvidencePack } from '@hold/evidence'
import { createQueueHandler } from './queue-batch.ts'
import { workerEvidence } from './worker-evidence.ts'

const dependencies = workerEvidence()
export const handler = createQueueHandler({ schema: evidenceMessageSchema, handle: (message) => makeEvidencePack(dependencies, message) })
