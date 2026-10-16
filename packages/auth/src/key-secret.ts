import { createHash } from 'node:crypto'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

type Client = { send: (command: GetSecretValueCommand) => Promise<{ readonly SecretString?: string | undefined }> }

const SHORTEST_SECRET = 32

// A key kept in Secrets Manager, such as the cookie key or the renter-link key. The secret's text is hashed to 32 bytes,
// so the web app and the worker derive the same key from it.
export async function readKeySecret(secretArn: string, region: string, client: Client = new SecretsManagerClient({ region })): Promise<Buffer> {
  const secret = await client.send(new GetSecretValueCommand({ SecretId: secretArn }))
  if (secret.SecretString === undefined || secret.SecretString.length < SHORTEST_SECRET) throw new Error('The key secret is empty or too short.')
  return createHash('sha256').update(secret.SecretString).digest()
}
