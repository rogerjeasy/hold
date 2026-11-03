import { recheckWaitingExecutions, relayOutbox } from '@hold/settle'
import { workerSettle } from './worker-settle.ts'

// Run every minute by EventBridge Scheduler (infra/lib/worker.ts): sends what waits in the outbox to its queue. Most
// messages are sent at once by the request that wrote them; this catches any whose send failed. It also sends again
// each money execution PayPal left waiting a quarter of an hour, so it is read back from PayPal without a webhook.
const settle = workerSettle()
const BATCH = 100

export async function handler(): Promise<{ readonly relayed: number; readonly rechecked: number }> {
  return { relayed: await relayOutbox(settle, BATCH), rechecked: await recheckWaitingExecutions(settle, BATCH) }
}
