import { EXECUTIONS_QUEUE, inShop, markExecutionSent } from '@hold/db'
import type { Transaction } from '@hold/db'
import type { RequestDependencies } from './dependencies.ts'

// Handing an execution to the worker (architecture.md section 7.6). Whoever records one sends it at once; its outbox
// message is the fallback if the send fails, and the queue takes one execution once.

export type ExecutionOutcome = 'confirmed' | 'failed' | 'waiting' | 'nothing_to_do'

export type RequestResult = { readonly ok: true; readonly executionId: string } | { readonly ok: false; readonly reason: string }

export function inWorkerShop<Result>(dependencies: RequestDependencies, shopId: string, work: (transaction: Transaction) => Promise<Result>): Promise<Result> {
  return inShop(dependencies.database, { role: dependencies.role ?? 'hold_worker', shopId }, work)
}

export const executionMessage = (shopId: string, rentalId: string, executionId: string) => ({
  queue: EXECUTIONS_QUEUE,
  group: rentalId,
  deduplicationId: `execution-${executionId}`,
  body: { shopId, executionId },
})

export async function sendExecution(dependencies: RequestDependencies, shopId: string, rentalId: string, executionId: string): Promise<void> {
  await dependencies.send(executionMessage(shopId, rentalId, executionId))
  await inWorkerShop(dependencies, shopId, (transaction) => markExecutionSent(transaction, executionId, dependencies.now()))
}
