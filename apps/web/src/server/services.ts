import 'server-only'
import { comparisonMessageSchema, createBedrockIncidentModel, createSimulatedIncidentModel, runComparison } from '@hold/compare'
import type { IncidentModel } from '@hold/compare'
import { createCognitoIdentity, createFakeIdentity, readKeySecret } from '@hold/auth'
import type { Identity } from '@hold/auth'
import { loadWebConfig } from '@hold/config'
import type { KeySource, WebConfig } from '@hold/config'
import type { Database } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createMemoryDocumentStore, createS3DocumentStore, createMemoryEvidenceStore, createS3EvidenceStore, makeDisplayCopy, mediaMessageSchema } from '@hold/evidence'
import type { DisplayJobDependencies, DocumentStore, EvidenceStore, MemoryEvidenceStore } from '@hold/evidence'
import { noFaces } from '@hold/vision'
import { createLazyMailer, createMemoryMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { createFakePayPal, createMemoryCredentialStore, createPayPalClient, createRestPayPalHolds, createSecretsManagerCredentialStore } from '@hold/paypal'
import type { CredentialStore, FakePayPal, PayPalCredentials, PayPalHolds } from '@hold/paypal'
import { applyPayPalEvent, createMemoryScheduler, createSqsSender, executionMessageSchema, paypalEventMessageSchema, runExecution, runUpkeep, upkeepMessageSchema } from '@hold/settle'
import type { Notice, QueueMessage, RequestDependencies, SettleDependencies } from '@hold/settle'
import { createRenterAsk } from './renter-ask'
import { simulatedRecords } from './simulated-records'

// What a PayPal credential check found: the credentials work, PayPal refused them, or PayPal could not be reached.
export type CredentialCheck = 'accepted' | 'refused' | 'unavailable'

// The outside services the web app reaches, built once per server process from its settings.
export type Services = {
  readonly config: WebConfig
  readonly cookieKey: Buffer
  // Signs renter links. A key of its own, which the worker reads too; never the cookie key once deployed.
  readonly renterLinkKey: Buffer
  readonly identity: Identity
  readonly database: Database
  readonly mailer: Mailer
  readonly paypalCredentials: CredentialStore
  readonly checkPayPalCredentials: (credentials: PayPalCredentials) => Promise<CredentialCheck>
  // PayPal, acting in the shop account whose credentials the reference names.
  readonly paypalFor: (credentialReference: string) => PayPalHolds
  // The test environment's PayPal, whose orders a simulated approval page approves. Absent everywhere else.
  readonly simulatedPayPal: FakePayPal | undefined
  // The webhook address of the shop whose account made an order, so the simulated PayPal can send its events there.
  readonly simulatedWebhookFor: (orderId: string) => string | undefined
  // Settling money with PayPal, acting as hold_app: work the app hands the worker goes through `send`.
  // Records executions and hands them to the worker. Only the test environment also runs them, in this process.
  readonly settle: RequestDependencies
  // Where photographs go. Absent on a developer's machine without buckets, where no photograph can be taken.
  readonly evidence: EvidenceStore | undefined
  // The test environment's store, which its simulated storage route fills and serves. Absent everywhere else.
  readonly simulatedEvidence: MemoryEvidenceStore | undefined
  readonly documents: DocumentStore | undefined
  // Sorts a renter's incident report: Claude on Bedrock, or in the test environment a stand-in that says it is simulated.
  readonly incidentModel: IncidentModel
  readonly flushRecords: (shopId: string) => Promise<void>
}

// The test environment has no worker: each message is handled at once, in this process, by the same code.
function runAtOnce(settle: () => SettleDependencies, media: DisplayJobDependencies, records: ReturnType<typeof simulatedRecords>): (message: QueueMessage) => Promise<void> {
  return async (message) => {
    if (message.queue === 'media') await makeDisplayCopy(media, mediaMessageSchema.parse(message.body))
    // This environment's model is explicitly simulated and never calls Bedrock. The same pipeline still rejects
    // reused, unreadable or poorly aligned photographs before any model result is considered.
    if (message.queue === 'comparisons') await runComparison({ database: media.database, role: media.role ?? 'hold_worker', evidence: media.evidence, model: { look: () => Promise.resolve({ kind: 'unavailable', model: 'simulated' }) }, simulated: true, now: () => new Date() }, comparisonMessageSchema.parse(message.body))
    if (message.queue === 'executions') await runExecution(settle(), executionMessageSchema.parse(message.body))
    if (message.queue === 'paypal-events') await applyPayPalEvent(settle(), paypalEventMessageSchema.parse(message.body))
    if (message.queue === 'upkeep') await runUpkeep(settle(), upkeepMessageSchema.parse(message.body))
    await records.handle(message.queue, message.body)
  }
}

// The code the test environment's fake identity sends every time. The end-to-end tests type it.
export const TEST_SIGN_IN_CODE = '24681357'
// The test environment's PayPal check refuses this secret, so a refusal can be tested too.
export const TEST_REFUSED_PAYPAL_SECRET = 'refused-by-paypal'

// The secret holds random text. The key is its SHA-256, which is always the 32 bytes AES-256 needs.
// A key named in the settings: given as is on a developer's machine, or read from its secret.
function loadKey(source: KeySource, region: string): Promise<Buffer> {
  return source.kind === 'value' ? Promise.resolve(source.key) : readKeySecret(source.secretArn, region)
}

async function checkWithPayPal(credentials: PayPalCredentials): Promise<CredentialCheck> {
  const client = createPayPalClient({ environment: 'sandbox', credentials: () => Promise.resolve(credentials) })
  const checked = await client.checkCredentials()
  if (checked.ok) return 'accepted'
  return checked.error.kind === 'unavailable' ? 'unavailable' : 'refused'
}

async function build(): Promise<Services> {
  const config = loadWebConfig(process.env)
  if (config.services === 'fake') {
    // Loaded only here, so a deployed server never has PGlite or the fakes in its path.
    const { createTestDatabase } = await import('@hold/db/testing')
    // One PayPal for every shop, which sends the renter to Hold's own simulated approval page.
    const simulatedPayPal = createFakePayPal({ now: () => new Date(), approvalUrl: (orderId) => `${config.publicUrl}/simulated-paypal/${orderId}` })
    // One PayPal for every shop, which remembers each account's webhook address and the account each order was made in.
    const webhookOfAccount = new Map<string, string>()
    const webhookOfOrder = new Map<string, string>()
    const paypalFor = (credentialReference: string): PayPalHolds => ({
      ...simulatedPayPal,
      createWebhook: (input) => {
        webhookOfAccount.set(credentialReference, input.url)
        return simulatedPayPal.createWebhook(input)
      },
      createFeeOrder: async (input) => remember(credentialReference, await simulatedPayPal.createFeeOrder(input)),
      createHoldOrder: async (input) => remember(credentialReference, await simulatedPayPal.createHoldOrder(input)),
    })
    function remember(credentialReference: string, created: Awaited<ReturnType<PayPalHolds['createHoldOrder']>>) {
      const url = webhookOfAccount.get(credentialReference)
      if (created.ok && url !== undefined) webhookOfOrder.set(created.value.orderId, url)
      return created
    }
    const database = await createTestDatabase()
    // Photographs go to a store in memory, through the app's own simulated storage route.
    const simulatedEvidence = createMemoryEvidenceStore({ baseUrl: `${config.publicUrl}/api/simulated-storage` })
    const documents = createMemoryDocumentStore()
    const mailer = createMemoryMailer()
    const records = simulatedRecords({ database, documents, evidence: simulatedEvidence, mailer })
    // Schedules are kept, never fired: nothing in the test environment runs long enough to reach them.
    // What the worker would tell people is kept, not sent.
    const notices: Notice[] = []
    const settle: SettleDependencies = {
      database,
      role: 'hold_app',
      paypalFor,
      paypalMode: config.paypalMode,
      send: runAtOnce(() => settle, { database, role: 'hold_app', evidence: simulatedEvidence, faces: noFaces }, records),
      scheduler: createMemoryScheduler(),
      notifier: { tell: (notice) => Promise.resolve(void notices.push(notice)) },
      renterAsk: createRenterAsk(database),
      now: () => new Date(),
    }
    return {
      config,
      cookieKey: await loadKey(config.cookieKey, 'us-east-1'),
      renterLinkKey: await loadKey(config.renterLinkKey, 'us-east-1'),
      identity: createFakeIdentity({ fixedCode: TEST_SIGN_IN_CODE }),
      database,
      mailer,
      paypalCredentials: createMemoryCredentialStore(),
      checkPayPalCredentials: (credentials) => Promise.resolve(credentials.clientSecret === TEST_REFUSED_PAYPAL_SECRET ? 'refused' : 'accepted'),
      paypalFor,
      simulatedPayPal,
      simulatedWebhookFor: (orderId) => webhookOfOrder.get(orderId),
      settle,
      evidence: simulatedEvidence,
      simulatedEvidence,
      documents,
      incidentModel: createSimulatedIncidentModel(),
      flushRecords: (shopId) => records.flush(shopId),
    }
  }
  const paypalCredentials = createSecretsManagerCredentialStore(config.region)
  const database = createDataApiDatabase({ region: config.region, clusterArn: config.database.clusterArn, secretArn: config.database.secretArn, database: config.database.name })
  const paypalFor = (credentialReference: string) =>
    createRestPayPalHolds(
      createPayPalClient({
        environment: config.paypalMode,
        credentials: async () => {
          const credentials = await paypalCredentials.read(credentialReference)
          if (credentials === undefined) throw new Error('The shop’s PayPal credentials are missing.')
          return credentials
        },
      }),
    )
  // Without the worker's queues, on a developer's machine, work waits in the outbox.
  const send = config.queues === undefined ? () => Promise.reject(new Error('No worker queues are set.')) : createSqsSender({ queues: config.queues, region: config.region })
  return {
    config,
    cookieKey: await loadKey(config.cookieKey, config.region),
    renterLinkKey: await loadKey(config.renterLinkKey, config.region),
    identity: createCognitoIdentity({ region: config.region, ...config.cognito }),
    database,
    // Through the SMTP account in Secrets Manager, read when the first email is sent.
    mailer: createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(config.smtpSecret, config.region))),
    paypalCredentials,
    checkPayPalCredentials: checkWithPayPal,
    paypalFor,
    simulatedPayPal: undefined,
    simulatedWebhookFor: () => undefined,
    settle: { database, role: 'hold_app', send, now: () => new Date() },
    evidence: config.photoBuckets === undefined ? undefined : createS3EvidenceStore({ evidenceBucket: config.photoBuckets.evidence, displayBucket: config.photoBuckets.display, region: config.region }),
    simulatedEvidence: undefined,
    documents: config.photoBuckets === undefined ? undefined : createS3DocumentStore({ evidenceBucket: config.photoBuckets.evidence, region: config.region }),
    incidentModel: createBedrockIncidentModel({ awsRegion: config.region }),
    flushRecords: () => Promise.resolve(),
  }
}

// Kept on globalThis: Next.js may load the proxy and the pages as separate bundles, and both must reach the same
// services. In the test environment, that is what lets a token the pages issued be refreshed by the proxy.
const holder = globalThis as typeof globalThis & { holdServices?: Promise<Services> }

export function getServices(): Promise<Services> {
  holder.holdServices ??= build()
  return holder.holdServices
}
