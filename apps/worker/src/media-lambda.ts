import { makeDisplayCopy, mediaMessageSchema } from '@hold/evidence'
import { createQueueHandler } from './queue-batch.ts'
import { workerMedia } from './worker-media.ts'

// Fed by the media queue (infra/lib/worker.ts): makes each recorded photograph's display copy, faces blurred.
const media = workerMedia()
export const handler = createQueueHandler({ schema: mediaMessageSchema, handle: (message) => makeDisplayCopy(media, message) })
