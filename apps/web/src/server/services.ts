import 'server-only'
import { comparisonMessageSchema, createBedrockContestModel, createBedrockIncidentModel, createSimulatedContestModel, createSimulatedIncidentModel, runComparison } from '@hold/compare'
import type { ContestModel, IncidentModel } from '@hold/compare'
import { createCognitoIdentity, createDemoSessionAccounts, createFakeIdentity, readKeySecret } from '@hold/auth'
import type { Identity } from '@hold/auth'
import { loadWebConfig } from '@hold/config'
import type { CredentialKeySource, KeySource, WebConfig } from '@hold/config'
import { OPS_AGENT_QUEUE, openDemoSession } from '@hold/db'
import type { Database } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'
import { createMemoryDocumentStore, createS3DocumentStore, createMemoryEvidenceStore, createS3EvidenceStore, makeDisplayCopy, mediaMessageSchema } from '@hold/evidence'
import type { DisplayJobDependencies, DocumentStore, EvidenceStore, MemoryEvidenceStore } from '@hold/evidence'
import { noFaces } from '@hold/vision'
import { opsAgentMessageSchema, runOperations } from '@hold/ops/run'
import type { OpsDependencies } from '@hold/ops/run'
import { createLazyMailer, createMemoryMailer, createSmtpMailer, loadSmtpSettings } from '@hold/notify'
import type { Mailer } from '@hold/notify'
import { createFakePayPal, createMemoryCredentialStore, createPayPalClient, createRestPayPalHolds, createSecretsManagerCredentialStore, credentialReference, DEMO_CREDENTIAL_OWNER, PAYPAL_EVENT_TYPES } from '@hold/paypal'
import type { CredentialStore, FakePayPal, PayPalCredentials, PayPalHolds } from '@hold/paypal'
import { applyPayPalEvent, createMemoryScheduler, createSqsSender, executionMessageSchema, paypalEventMessageSchema, runExecution, runUpkeep, upkeepMessageSchema } from '@hold/settle'
import type { Notice, QueueMessage, RequestDependencies, SettleDependencies } from '@hold/settle'
import { createKmsSigner, createLocalSigner, kmsCalls, renterKeyFor } from '@hold/trust'
import { createScriptedAdvocate, negotiationMessageSchema, runNegotiation } from '@hold/negotiate'
import type { CredentialSigner, RenterKey } from '@hold/trust'
import type { DemoSessionServices } from '@/features/auth/demo-session'
import { createRenterAsk } from './renter-ask'
import { simulatedOperations } from './simulated-operations'
import { simulatedRecords } from './simulated-records'
import { DEMO_WEBHOOK_PATH } from './demo-webhook-address'
import { withSamplePhotos } from './sample-photos'

// What a PayPal credential check found: the credentials work, PayPal refused them, or PayPal could not be reached.
export type CredentialCheck = 'accepted' | 'refused' | 'unavailable'

// The outside services the web app reaches, built once per server process from its settings.
export type Services = {
  readonly config: WebConfig
  readonly cookieKey: Buffer
  // Signs renter links. A key of its own, which the worker reads too; never the cookie key once deployed.
  readonly renterLinkKey: Buffer
  readonly identity: Identity
  // What starts a judge's own demo: its accounts, its shop and the shared sandbox connection. Nothing where demo mode is
  // off, which is every deployment but the demo.
  readonly demoSessions: DemoSessionServices | undefined
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
  // Writes the neutral summary when a renter contests a claim (architecture.md section 6.15).
  readonly contestModel: ContestModel
  readonly flushRecords: (shopId: string) => Promise<void>
  // The Clean Record (extensions.md section 7): the renter key, made with a secret only Hold has, and the key that
  // signs credentials, read from KMS on first use so the app starts without it.
  readonly trust: { readonly renterKey: RenterKey; readonly signer: () => Promise<CredentialSigner> }
}

// The credential signer, made once. A KMS key is read on first use: a failure then fails that credential, not the app.
function credentialSigner(source: CredentialKeySource, region: string): () => Promise<CredentialSigner> {
  let signer: Promise<CredentialSigner> | undefined
  return () => {
    signer ??= source.kind === 'kms' ? createKmsSigner({ keyId: source.keyId, kms: kmsCalls(region) }) : Promise.resolve(createLocalSigner())
    signer.catch(() => {
      signer = undefined
    })
    return signer
  }
}

// The test environment has no worker: each message is handled at once, in this process, by the same code.
function runAtOnce(settle: () => SettleDependencies, media: DisplayJobDependencies, records: ReturnType<typeof simulatedRecords>, operations: OpsDependencies): (message: QueueMessage) => Promise<void> {
  return async (message) => {
    if (message.queue === 'media') await makeDisplayCopy(media, mediaMessageSchema.parse(message.body))
    // This environment's model is explicitly simulated and never calls Bedrock. The same pipeline still rejects
    // reused, unreadable or poorly aligned photographs before any model result is considered.
    if (message.queue === 'comparisons') await runComparison({ database: media.database, role: media.role ?? 'hold_worker', evidence: media.evidence, model: { look: () => Promise.resolve({ kind: 'unavailable', model: 'simulated' }) }, simulated: true, now: () => new Date() }, comparisonMessageSchema.parse(message.body))
    if (message.queue === 'executions') await runExecution(settle(), executionMessageSchema.parse(message.body))
    if (message.queue === 'paypal-events') await applyPayPalEvent(settle(), paypalEventMessageSchema.parse(message.body))
    if (message.queue === 'upkeep') await runUpkeep(settle(), upkeepMessageSchema.parse(message.body))
    // Both advocates are the simulated stand-in here, which never calls Bedrock and marks every move simulated.
    if (message.queue === 'negotiations') await runNegotiation({ database: media.database, role: 'hold_worker', models: { shop: createScriptedAdvocate(), renter: createScriptedAdvocate() }, now: () => new Date() }, negotiationMessageSchema.parse(message.body))
    if (message.queue === OPS_AGENT_QUEUE) await runOperations(operations, opsAgentMessageSchema.parse(message.body))
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

// The demo's one PayPal sandbox connection, which every demo session's shop shares by reference. An administrator
// (pnpm demo:paypal) stores it. Until it does, a demo opens without PayPal and its PayPal page says so.
export const DEMO_PAYPAL_REFERENCE = credentialReference(DEMO_CREDENTIAL_OWNER, 'sandbox')

// The shared app's one webhook, at the demo's own address. Subscribing an address that is already subscribed finds
// the earlier subscription, so every demo start gets the same one. PayPal takes only an HTTPS address, so on a
// developer's machine there is none, and the demo reads every step back from PayPal instead.
async function demoWebhook(paypal: PayPalHolds, publicUrl: string): Promise<string | undefined> {
  if (!publicUrl.startsWith('https://')) return undefined
  const subscribed = await paypal.createWebhook({ url: `${publicUrl}${DEMO_WEBHOOK_PATH}`, eventTypes: PAYPAL_EVENT_TYPES })
  if (subscribed.ok) return subscribed.value.webhookId
  console.warn(JSON.stringify({ event: 'demo_webhook_unsubscribed', kind: subscribed.error.kind }))
  return undefined
}

function demoPayPalFrom(store: CredentialStore, paypalFor: (credentialReference: string) => PayPalHolds, publicUrl: string): DemoSessionServices['paypal'] {
  return async () => {
    try {
      if ((await store.read(DEMO_PAYPAL_REFERENCE)) === undefined) return undefined
    } catch (error) {
      console.warn(JSON.stringify({ event: 'demo_paypal_unreadable', name: error instanceof Error ? error.name : 'unknown' }))
      return undefined
    }
    const webhookId = await demoWebhook(paypalFor(DEMO_PAYPAL_REFERENCE), publicUrl)
    return { credentialReference: DEMO_PAYPAL_REFERENCE, mode: 'sandbox', ...(webhookId === undefined ? {} : { webhookId }) }
  }
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
    // The open scorecard's end-to-end tests read a made-up accepted run; nothing outside this environment records one.
    if (config.evalFixture) {
      const { recordFixtureEvalRuns } = await import('@hold/db/testing/eval-fixture')
      await recordFixtureEvalRuns(database, new Date())
    }
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
      send: runAtOnce(() => settle, { database, role: 'hold_app', evidence: simulatedEvidence, faces: noFaces }, records, simulatedOperations(database, simulatedPayPal)),
      scheduler: createMemoryScheduler(),
      notifier: { tell: (notice) => Promise.resolve(void notices.push(notice)) },
      renterAsk: createRenterAsk(database),
      now: () => new Date(),
    }
    const identity = createFakeIdentity({ fixedCode: TEST_SIGN_IN_CODE })
    return {
      config,
      cookieKey: await loadKey(config.cookieKey, 'us-east-1'),
      renterLinkKey: await loadKey(config.renterLinkKey, 'us-east-1'),
      identity,
      demoSessions: {
        accounts: { create: (account) => Promise.resolve(identity.addDemoAccount(account.email, account.password)) },
        open: (input) => openDemoSession(database, input),
        paypal: async () => {
          const subscribed = await simulatedPayPal.createWebhook({ url: `${config.publicUrl}${DEMO_WEBHOOK_PATH}`, eventTypes: PAYPAL_EVENT_TYPES })
          return { credentialReference: DEMO_PAYPAL_REFERENCE, mode: 'sandbox', ...(subscribed.ok ? { webhookId: subscribed.value.webhookId } : {}) }
        },
      },
      database,
      mailer,
      paypalCredentials: createMemoryCredentialStore(),
      checkPayPalCredentials: (credentials) => Promise.resolve(credentials.clientSecret === TEST_REFUSED_PAYPAL_SECRET ? 'refused' : 'accepted'),
      paypalFor,
      simulatedPayPal,
      simulatedWebhookFor: (orderId) => webhookOfOrder.get(orderId),
      settle,
      evidence: withSamplePhotos(simulatedEvidence),
      simulatedEvidence,
      documents,
      incidentModel: createSimulatedIncidentModel(),
      contestModel: createSimulatedContestModel(),
      flushRecords: (shopId) => records.flush(shopId),
      trust: { renterKey: renterKeyFor(await loadKey(config.trustKey, 'us-east-1')), signer: credentialSigner(config.credentialKey, 'us-east-1') },
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
    demoSessions: config.demoSessions
      ? { accounts: createDemoSessionAccounts({ region: config.region, ...config.cognito }), open: (input) => openDemoSession(database, input), paypal: demoPayPalFrom(paypalCredentials, paypalFor, config.publicUrl) }
      : undefined,
    database,
    // Through the SMTP account in Secrets Manager, read when the first email is sent.
    mailer: createLazyMailer(async () => createSmtpMailer(await loadSmtpSettings(config.smtpSecret, config.region))),
    paypalCredentials,
    checkPayPalCredentials: checkWithPayPal,
    paypalFor,
    simulatedPayPal: undefined,
    simulatedWebhookFor: () => undefined,
    settle: { database, role: 'hold_app', send, now: () => new Date() },
    evidence: config.photoBuckets === undefined ? undefined : withSamplePhotos(createS3EvidenceStore({ evidenceBucket: config.photoBuckets.evidence, displayBucket: config.photoBuckets.display, region: config.region })),
    simulatedEvidence: undefined,
    documents: config.photoBuckets === undefined ? undefined : createS3DocumentStore({ evidenceBucket: config.photoBuckets.evidence, region: config.region }),
    incidentModel: createBedrockIncidentModel({ awsRegion: config.region }),
    contestModel: createBedrockContestModel({ awsRegion: config.region }),
    flushRecords: () => Promise.resolve(),
    trust: { renterKey: renterKeyFor(await loadKey(config.trustKey, config.region)), signer: credentialSigner(config.credentialKey, config.region) },
  }
}

// Kept on globalThis: Next.js may load the proxy and the pages as separate bundles, and both must reach the same
// services. In the test environment, that is what lets a token the pages issued be refreshed by the proxy.
const holder = globalThis as typeof globalThis & { holdServices?: Promise<Services> }

export function getServices(): Promise<Services> {
  holder.holdServices ??= build()
  return holder.holdServices
}
