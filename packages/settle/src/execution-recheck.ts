import { executionsToRecheck } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import { executionMessage } from './execution-queue.ts'

// How long a money execution PayPal left waiting is given before Hold reads it back from PayPal again, rather than
// waiting only for a webhook that may never come (architecture.md section 7.6).
export const EXECUTION_RECHECK_MINUTES = 15

// Sends each execution that has waited that long to the worker again. Running it again repeats nothing PayPal already
// did: a call PayPal took is made with the same PayPal-Request-Id, and a resource Hold saved is only read back. A
// confirmed or failed execution is never sent. Each re-check has its own deduplication id, so the queue does not
// take it for the first send.
export async function recheckWaitingExecutions(dependencies: SettleDependencies, max: number): Promise<number> {
  const now = dependencies.now()
  const due = await executionsToRecheck(dependencies.database, new Date(now.getTime() - EXECUTION_RECHECK_MINUTES * 60_000), now, max)
  for (const execution of due) {
    const message = executionMessage(execution.shopId, execution.rentalId, execution.id)
    await dependencies.send({ ...message, deduplicationId: `${message.deduplicationId}-recheck-${String(now.getTime())}` })
  }
  return due.length
}
