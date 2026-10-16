import { relayOutbox } from '@hold/settle'
import { workerSettle } from './worker-settle.ts'

// Run every minute by EventBridge Scheduler (infra/lib/worker.ts): sends what waits in the outbox to its queue. Most
// messages are sent at once by the request that wrote them; this catches any whose send failed.
const settle = workerSettle()
const BATCH = 100

export async function handler(): Promise<{ readonly relayed: number }> {
  return { relayed: await relayOutbox(settle, BATCH) }
}
