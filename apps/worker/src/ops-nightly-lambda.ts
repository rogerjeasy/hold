import { shopsForOperations } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createSqsSender } from '@hold/settle'
import { loadOperationsSettings } from './operations-settings.ts'

// Run once a night by EventBridge Scheduler (infra/lib/ops-worker.ts): one operations run per shop with a PayPal
// account, each a message of its own, so one shop's failure is retried without the others.
const settings = loadOperationsSettings(process.env)
const database = createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name })
const send = createSqsSender({ queues: { 'ops-agent': settings.opsAgentQueueUrl }, region: settings.region })

export async function handler(): Promise<{ readonly queued: number }> {
  const day = new Date().toISOString().slice(0, 10)
  const shops = await shopsForOperations(database, settings.paypalMode)
  for (const shopId of shops) await send({ queue: 'ops-agent', group: shopId, deduplicationId: `ops-nightly-${shopId}-${day}`, body: { shopId, trigger: 'nightly' } })
  return { queued: shops.length }
}
