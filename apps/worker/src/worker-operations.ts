import { findPayPalAccount, inShop } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createLazyMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import { createBedrockInvestigator, openPayPalReader, paypalTransport } from '@hold/ops'
import type { OpsDependencies } from '@hold/ops'
import { createRestPayPalHolds } from '@hold/paypal'
import { createReminderSender } from './reminder-sender.ts'
import { loadOperationsSettings } from './operations-settings.ts'
import { shopPayPalClient } from './worker-settle.ts'

// What the operations agent needs, built once per function instance: the worker's database, Claude on Bedrock, the
// shop's PayPal account read by code and through PayPal's MCP server with the shop's own token, and email.
export function workerOperations(): OpsDependencies {
  const settings = loadOperationsSettings(process.env)
  const database = createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name })
  const mailer = createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(settings.smtpSecret, settings.region)))
  return {
    database,
    now: () => new Date(),
    investigator: createBedrockInvestigator({ awsRegion: settings.region }),
    async paypal(shopId) {
      const account = await inShop(database, { role: 'hold_worker', shopId }, (transaction) => findPayPalAccount(transaction, shopId, settings.paypalMode))
      if (account === undefined) return undefined
      const client = shopPayPalClient(settings, account.credentialReference)
      const holds = createRestPayPalHolds(client)
      return {
        async disputes() { const read = await holds.listOpenDisputes(); return read.ok ? read.value : undefined },
        async authorization(authorizationId) { const read = await holds.readAuthorization(authorizationId); return read.ok ? read.value.status : undefined },
        async openReader() {
          // The token stays inside Hold: it goes to PayPal's server, never to the model provider.
          const token = await client.accessToken()
          return token.ok ? openPayPalReader(paypalTransport(token.value, settings.paypalMcpUrl)) : { ok: false, reason: 'unreachable' }
        },
      }
    },
    remind: createReminderSender({ database, mailer }),
  }
}
