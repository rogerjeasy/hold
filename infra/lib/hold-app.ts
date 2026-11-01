import { App, CliCredentialsStackSynthesizer, Tags } from 'aws-cdk-lib'
import { ManagedPolicy, PermissionsBoundary } from 'aws-cdk-lib/aws-iam'
import { createDataStack } from './data-stack.ts'
import { createDeliveryStack } from './delivery-stack.ts'
import { createIdentityStack } from './identity-stack.ts'
import { createRegistryStack } from './registry-stack.ts'
import { ACCOUNT, CDK_ASSETS_PREFIX, CDK_BOOTSTRAP_QUALIFIER, PERMISSIONS_BOUNDARY, REGION, TAGS } from './settings.ts'
import { createWebStack } from './web-stack.ts'
import { createWorkStack } from './work-stack.ts'

export type HoldAppOptions = {
  readonly senderEmail: string
  // The commit whose image the web app runs.
  readonly webImageTag: string
  // The web app's own address, once App Runner has given it one.
  readonly webPublicUrl: string | undefined
  // Texts to renters (architecture.md section 12.3): the account's sender, once an administrator has one, and whether
  // delivery reports are on, which needs HoldDelivery deployed with the permissions to make them.
  readonly textSender?: string | undefined
  readonly textReports?: boolean
}

// A browser offers a passkey only on the domain it was made for, so passkeys are made for the web app's own host.
// Before the app has an address, they are made for a developer's machine.
function passkeyDomain(webPublicUrl: string | undefined): string {
  return webPublicUrl === undefined ? 'localhost' : new URL(webPublicUrl).hostname
}

// Builds every Hold stack. Kept apart from bin/ so tests can build the same app without the command line.
export function createHoldApp(app: App, options: HoldAppOptions) {
  // Pinned, so a profile that points at a different account cannot deploy Hold there by accident.
  const env = { account: ACCOUNT, region: REGION }
  for (const [key, value] of Object.entries(TAGS)) Tags.of(app).add(key, value)
  // Deployed with the caller's own credentials, not the shared bootstrap's roles. Each stack gets its own.
  const synthesizer = () => new CliCredentialsStackSynthesizer({ qualifier: CDK_BOOTSTRAP_QUALIFIER, bucketPrefix: CDK_ASSETS_PREFIX })

  // Before App Runner has given the web app an address, links and uploads point at a developer's machine.
  const publicUrl = options.webPublicUrl ?? 'http://localhost:3000'
  const texts = { sender: options.textSender, reports: options.textReports ?? false }
  const data = createDataStack(app, { env, synthesizer: synthesizer(), publicUrl })
  const identity = createIdentityStack(app, { env, synthesizer: synthesizer(), senderEmail: options.senderEmail, passkeyRelyingPartyId: passkeyDomain(options.webPublicUrl) })
  const registry = createRegistryStack(app, { env, synthesizer: synthesizer() })
  const work = createWorkStack(app, {
    env,
    synthesizer: synthesizer(),
    cluster: data.cluster,
    workerUserSecret: data.workerUserSecret,
    renterLinkKey: identity.renterLinkKey,
    publicUrl,
    evidenceBucket: data.evidenceBucket,
    displayBucket: data.displayBucket,
    texts,
  })
  const stacks = {
    data,
    identity,
    work,
    registry,
    web: createWebStack(app, {
      env,
      synthesizer: synthesizer(),
      repository: registry.repository,
      imageTag: options.webImageTag,
      publicUrl: options.webPublicUrl,
      cluster: data.cluster,
      appUserSecret: data.appUserSecret,
      userPool: identity.userPool,
      webClient: identity.webClient,
      cookieKey: identity.cookieKey,
      renterLinkKey: identity.renterLinkKey,
      trustKey: identity.trustKey,
      evidenceBucket: data.evidenceBucket,
      displayBucket: data.displayBucket,
      queues: work.queues,
      texts,
    }),
    delivery: createDeliveryStack(app, { env, synthesizer: synthesizer() }),
  }
  // Every role the resource stacks make is capped by the boundary HoldDelivery defines, so none reaches beyond Hold.
  for (const resources of [stacks.data, stacks.identity, stacks.work, stacks.registry, stacks.web]) {
    PermissionsBoundary.of(resources.stack).apply(ManagedPolicy.fromManagedPolicyName(resources.stack, 'HoldBoundary', PERMISSIONS_BOUNDARY))
  }
  return stacks
}
