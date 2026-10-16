import { createDataApiDatabase } from '@hold/db/data-api'
import { createPayPalClient, createRestPayPalHolds, createSecretsManagerCredentialStore } from '@hold/paypal'
import { createSqsSender } from '@hold/settle'
import type { SettleDependencies } from '@hold/settle'
import { loadWorkerSettings } from './worker-settings.ts'

// What settling needs, built once per function instance: the database as hold_worker, each shop's PayPal account
// through its credentials in Secrets Manager, and the worker's queues.
export function workerSettle(): SettleDependencies {
  const settings = loadWorkerSettings(process.env)
  const credentials = createSecretsManagerCredentialStore(settings.region)
  return {
    database: createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name }),
    role: 'hold_worker',
    paypalMode: settings.paypalMode,
    paypalFor: (credentialReference) =>
      createRestPayPalHolds(
        createPayPalClient({
          environment: settings.paypalMode,
          credentials: async () => {
            const found = await credentials.read(credentialReference)
            if (found === undefined) throw new Error('The shop’s PayPal credentials are missing.')
            return found
          },
        }),
      ),
    send: createSqsSender({ queues: settings.queues, region: settings.region }),
    now: () => new Date(),
  }
}
