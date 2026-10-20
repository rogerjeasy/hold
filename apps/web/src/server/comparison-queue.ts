import 'server-only'
import { COMPARISONS_QUEUE } from '@hold/db'
import { getServices } from './services'

// The sealing transaction already wrote the outbox. Sending immediately shortens the wait; the worker's lease and
// terminal-state check make its later outbox delivery harmless.
export async function sendComparisons(shopId: string, rentalId: string, comparisonIds: readonly string[]): Promise<void> {
  const { settle } = await getServices()
  for (const comparisonId of comparisonIds) await settle.send({ queue: COMPARISONS_QUEUE, group: rentalId, deduplicationId: `comparison-${comparisonId}`, body: { shopId, comparisonId } })
}
