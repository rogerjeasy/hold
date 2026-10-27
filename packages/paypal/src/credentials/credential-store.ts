import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceExistsException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { z } from 'zod'
import type { PayPalCredentials, PayPalEnvironment } from '../rest/client.ts'

// Where each shop's PayPal API credentials are kept (architecture.md section 8.1). The database holds only the
// reference this returns, never the credentials. In production Hold would act through PayPal's partner model and
// hold no credentials at all; this interface is the one place that change would touch.
export type CredentialStore = {
  save(shopId: string, environment: PayPalEnvironment, credentials: PayPalCredentials): Promise<string>
  read(reference: string): Promise<PayPalCredentials | undefined>
}

const credentialsSchema = z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) }).strict()

// Where the demo's one sandbox connection is kept, in place of a shop ID: every demo session's shop shares it
// (architecture.md section 20.3). Shop IDs are UUIDs, so it can name no real shop.
export const DEMO_CREDENTIAL_OWNER = 'demo'

export function credentialReference(shopId: string, environment: PayPalEnvironment): string {
  return `hold/paypal/shops/${shopId}/${environment}`
}

// The client is passed in only by tests.
export function createSecretsManagerCredentialStore(
  region: string,
  client: Pick<SecretsManagerClient, 'send'> = new SecretsManagerClient({ region }),
): CredentialStore {
  return {
    async save(shopId, environment, credentials) {
      const name = credentialReference(shopId, environment)
      const value = JSON.stringify({ clientId: credentials.clientId, clientSecret: credentials.clientSecret })
      try {
        await client.send(
          new CreateSecretCommand({
            Name: name,
            SecretString: value,
            Description: 'Hold: one shop’s PayPal API credentials',
            Tags: [{ Key: 'project', Value: 'hold' }],
          }),
        )
      } catch (error) {
        // Connecting again replaces the credentials kept for the shop.
        if (!(error instanceof ResourceExistsException)) throw error
        await client.send(new PutSecretValueCommand({ SecretId: name, SecretString: value }))
      }
      return name
    },
    async read(reference) {
      const secret = await client.send(new GetSecretValueCommand({ SecretId: reference }))
      const parsed = credentialsSchema.safeParse(JSON.parse(secret.SecretString ?? 'null'))
      return parsed.success ? parsed.data : undefined
    },
  }
}

export function createMemoryCredentialStore(): CredentialStore & { readonly saved: ReadonlyMap<string, PayPalCredentials> } {
  const saved = new Map<string, PayPalCredentials>()
  return {
    saved,
    save(shopId, environment, credentials) {
      const name = credentialReference(shopId, environment)
      saved.set(name, credentials)
      return Promise.resolve(name)
    },
    read(reference) {
      return Promise.resolve(saved.get(reference))
    },
  }
}
