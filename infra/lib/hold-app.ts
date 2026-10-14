import { App, CliCredentialsStackSynthesizer, Tags } from 'aws-cdk-lib'
import { createDataStack } from './data-stack.ts'
import { createDeliveryStack } from './delivery-stack.ts'
import { createIdentityStack } from './identity-stack.ts'
import { createRegistryStack } from './registry-stack.ts'
import { ACCOUNT, CDK_ASSETS_PREFIX, CDK_BOOTSTRAP_QUALIFIER, REGION, TAGS } from './settings.ts'
import { createWorkStack } from './work-stack.ts'

export type HoldAppOptions = {
  readonly senderEmail: string
  readonly passkeyRelyingPartyId: string
}

// Builds every Hold stack. Kept apart from bin/ so tests can build the same app without the command line.
export function createHoldApp(app: App, options: HoldAppOptions) {
  // Pinned, so a profile that points at a different account cannot deploy Hold there by accident.
  const env = { account: ACCOUNT, region: REGION }
  for (const [key, value] of Object.entries(TAGS)) Tags.of(app).add(key, value)
  // Deployed with the caller's own credentials, not the shared bootstrap's roles. Each stack gets its own.
  const synthesizer = () => new CliCredentialsStackSynthesizer({ qualifier: CDK_BOOTSTRAP_QUALIFIER, bucketPrefix: CDK_ASSETS_PREFIX })

  return {
    data: createDataStack(app, { env, synthesizer: synthesizer() }),
    identity: createIdentityStack(app, { env, synthesizer: synthesizer(), senderEmail: options.senderEmail, passkeyRelyingPartyId: options.passkeyRelyingPartyId }),
    work: createWorkStack(app, { env, synthesizer: synthesizer() }),
    registry: createRegistryStack(app, { env, synthesizer: synthesizer() }),
    delivery: createDeliveryStack(app, { env, synthesizer: synthesizer() }),
  }
}
