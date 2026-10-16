import { readKeySecret } from '@hold/auth'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createLazyMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import { createPayPalClient, createRestPayPalHolds, createSecretsManagerCredentialStore } from '@hold/paypal'
import { createEventBridgeScheduler, createSqsSender } from '@hold/settle'
import type { SettleDependencies } from '@hold/settle'
import { createEmailNotifier } from './email-notifier.ts'
import { createWorkerRenterAsk } from './renter-ask.ts'
import { loadWorkerSettings } from './worker-settings.ts'

// What settling needs, built once per function instance: the database as hold_worker, each shop's PayPal account
// through its credentials in Secrets Manager, the worker's queues and its schedules, and email through Hold's SMTP
// account, read when the first email is sent.
export function workerSettle(): SettleDependencies {
  const settings = loadWorkerSettings(process.env)
  const credentials = createSecretsManagerCredentialStore(settings.region)
  const database = createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name })
  const mailer = createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(settings.smtpSecret, settings.region)))
  // Read once, when the first link is signed.
  let linkKey: Promise<Buffer> | undefined
  const readLinkKey = () => (linkKey ??= readKeySecret(settings.renterLinkKeySecretArn, settings.region))
  return {
    database,
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
    scheduler: createEventBridgeScheduler({ ...settings.schedules, region: settings.region }),
    notifier: createEmailNotifier({ database, mailer, publicUrl: settings.publicUrl }),
    renterAsk: createWorkerRenterAsk({ database, publicUrl: settings.publicUrl, linkKey: readLinkKey }),
    now: () => new Date(),
  }
}
