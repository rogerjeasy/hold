import { findPayPalAccount, inShop, publishedEvidencePack, renterContact, shopSettings } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createS3DocumentStore } from '@hold/evidence'
import { createLazyMailer, createSmtpMailer, loadSmtpSettings, shopMessageEmail } from '@hold/notify'
import { createBedrockInvestigator, openPayPalReader, paypalTransport } from '@hold/ops'
import type { CarryOutDependencies, OpsDependencies } from '@hold/ops'
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

// What sending an approved message or dispute answer needs: the database, email, the shop's own PayPal account, and
// the evidence packs a dispute answer attaches.
export function workerCarryOut(): CarryOutDependencies {
  const settings = loadOperationsSettings(process.env)
  const database = createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name })
  const mailer = createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(settings.smtpSecret, settings.region)))
  const documents = createS3DocumentStore({ evidenceBucket: settings.evidenceBucket, region: settings.region })
  return {
    database,
    now: () => new Date(),
    async message(input) {
      const { shop, renter } = await inShop(database, { role: 'hold_worker', shopId: input.shopId }, async (transaction) => ({ shop: await shopSettings(transaction, input.shopId), renter: await renterContact(transaction, input.rentalId) }))
      if (shop === undefined || renter === undefined) return false
      return mailer.send(shopMessageEmail(renter.email, renter.language, { shopName: shop.name, text: input.text }))
    },
    // The approved notes go to PayPal as evidence, with the disputed rental's latest published record as a PDF.
    async answerDispute(shopId, input) {
      const { account, pack } = await inShop(database, { role: 'hold_worker', shopId }, async (transaction) => ({
        account: await findPayPalAccount(transaction, shopId, settings.paypalMode),
        pack: input.rentalId === null ? undefined : await publishedEvidencePack(transaction, input.rentalId),
      }))
      if (account === undefined) return false
      const document = pack === undefined ? undefined : { fileName: `hold-record-v${String(pack.version)}.pdf`, bytes: await documents.read(pack.evidenceKey, pack.pdfVersionId) }
      const paypal = createRestPayPalHolds(shopPayPalClient(settings, account.credentialReference))
      return (await paypal.provideDisputeEvidence({ disputeId: input.disputeId, notes: input.notes, document, idempotencyKey: input.idempotencyKey })).ok
    },
  }
}
