import { applyPayPalEvent } from '@hold/settle'
import { createQueueHandler } from './queue-batch.ts'
import { workerSettle } from './worker-settle.ts'

// Fed by the paypal-events queue (infra/lib/worker.ts): verifies each stored event with PayPal and applies it.
const settle = workerSettle()
export const handler = createQueueHandler({ field: 'eventId', handle: (message) => applyPayPalEvent(settle, message) })
